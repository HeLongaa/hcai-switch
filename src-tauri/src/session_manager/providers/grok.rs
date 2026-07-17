//! Grok Build 会话扫描与消息加载
//!
//! ~/.grok/sessions/<encoded_cwd>/<uuid>/
//!   - chat_history.jsonl
//!   - events.jsonl
//!   - summary.json

use crate::grok_config::get_grok_config_dir;
use crate::session_manager::{SessionMessage, SessionMeta};
use super::utils::{extract_text, parse_timestamp_to_ms, truncate_summary, TITLE_MAX_CHARS};
use serde_json::Value;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};

/// 简单 percent decode（处理 %2F 等）
fn decode_grok_path(encoded: &str) -> String {
    let mut out = String::new();
    let bytes = encoded.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = &encoded[i + 1..i + 3];
            if let Ok(val) = u8::from_str_radix(hex, 16) {
                out.push(val as char);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

pub fn scan_sessions() -> Vec<SessionMeta> {
    let root = get_grok_config_dir().join("sessions");
    if !root.is_dir() {
        return vec![];
    }

    let mut sessions: Vec<SessionMeta> = Vec::new();

    let Ok(entries) = fs::read_dir(&root) else {
        return sessions;
    };

    for entry in entries.flatten() {
        let project_encoded = entry.file_name().to_string_lossy().to_string();
        let project_path = entry.path();
        if !project_path.is_dir() {
            continue;
        }

        let project_dir = decode_grok_path(&project_encoded);

        let Ok(uuid_dirs) = fs::read_dir(&project_path) else {
            continue;
        };

        for uentry in uuid_dirs.flatten() {
            let uuid = uentry.file_name().to_string_lossy().to_string();
            let session_dir = uentry.path();
            if !session_dir.is_dir() {
                continue;
            }

            // 优先 chat_history.jsonl 作为消息源
            let chat_path = session_dir.join("chat_history.jsonl");
            let source_path = if chat_path.exists() {
                chat_path.to_string_lossy().to_string()
            } else {
                // fallback 到 events
                session_dir
                    .join("events.jsonl")
                    .to_string_lossy()
                    .to_string()
            };

            // summary.json 提供标题和时间
            let summary_path = session_dir.join("summary.json");
            let (title, last_active_at, created_at) = if summary_path.exists() {
                match fs::read_to_string(&summary_path) {
                    Ok(text) => match serde_json::from_str::<Value>(&text) {
                        Ok(v) => {
                            let t = v
                                .get("generated_title")
                                .and_then(|x| x.as_str())
                                .map(|s| truncate_summary(s, TITLE_MAX_CHARS));
                            let la = v.get("last_active_at").and_then(parse_timestamp_to_ms);
                            let ca = v.get("created_at").and_then(parse_timestamp_to_ms);
                            (t, la, ca)
                        }
                        _ => (None, None, None),
                    },
                    _ => (None, None, None),
                }
            } else {
                (None, None, None)
            };

            let resume_command = Some(format!(
                "cd \"{}\" && grok",
                project_dir.replace('\\', "\\\\").replace('"', "\\\"")
            ));

            sessions.push(SessionMeta {
                provider_id: "grok".to_string(),
                session_id: uuid,
                title,
                summary: None,
                project_dir: Some(project_dir.clone()),
                created_at,
                last_active_at,
                source_path: Some(source_path),
                resume_command,
            });
        }
    }

    sessions
}

pub fn load_messages(source_path: &str) -> Result<Vec<SessionMessage>, String> {
    let file = File::open(source_path).map_err(|e| format!("无法打开 Grok 会话文件: {e}"))?;
    let reader = BufReader::new(file);
    let mut messages = Vec::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }

        let value: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let typ = value.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if typ != "user" && typ != "assistant" {
            continue;
        }

        let role = if typ == "user" { "user" } else { "assistant" }.to_string();
        let content = extract_text(value.get("content").unwrap_or(&Value::Null));

        if !content.trim().is_empty() {
            // 尝试从 _meta 拿时间
            let ts = value
                .get("_meta")
                .and_then(|m| m.get("agentTimestampMs"))
                .and_then(parse_timestamp_to_ms);

            messages.push(SessionMessage { role, content, ts });
        }
    }

    Ok(messages)
}
