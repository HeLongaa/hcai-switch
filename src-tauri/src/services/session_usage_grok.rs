//! Grok Build 会话日志使用追踪
//!
//! 从 ~/.grok/sessions/ 下的 JSONL 会话文件中提取使用数据（model + tokens）。
//!
//! 目录结构： ~/.grok/sessions/<encoded_cwd>/<uuid>/{events.jsonl,chat_history.jsonl,updates.jsonl}
//!
//! 注意：Grok 的本地日志中 token 信息主要以 totalTokens 形式出现在 _meta 中，
//! 没有标准的 input/output 拆分。当通过代理使用时，完整 token 数据会通过 proxy 路径记录。

use crate::database::{lock_conn, Database};
use crate::error::AppError;
use crate::grok_config::get_grok_config_dir;
use crate::proxy::usage::calculator::CostCalculator;
use crate::proxy::usage::parser::TokenUsage;
use crate::services::session_usage::{
    get_sync_state, metadata_modified_nanos, update_sync_state, SessionSyncResult,
};
use crate::services::usage_stats::{find_model_pricing, should_skip_session_insert, DedupKey};
use rust_decimal::Decimal;
use serde_json::Value;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// 从 Grok 日志中提取的简要使用记录
#[derive(Debug)]
struct GrokUsageRecord {
    model: String,
    total_tokens: u32,
    timestamp: Option<String>,
    session_id: String,
    turn_or_event: String,
}

/// 同步 Grok 使用数据
pub fn sync_grok_usage(db: &Database) -> Result<SessionSyncResult, AppError> {
    let grok_sessions = get_grok_config_dir().join("sessions");
    if !grok_sessions.is_dir() {
        return Ok(SessionSyncResult {
            imported: 0,
            skipped: 0,
            files_scanned: 0,
            errors: vec![],
        });
    }

    let mut result = SessionSyncResult {
        imported: 0,
        skipped: 0,
        files_scanned: 0,
        errors: vec![],
    };

    let files = collect_grok_jsonl_files(&grok_sessions);
    result.files_scanned = files.len() as u32;

    for file_path in &files {
        match sync_single_grok_file(db, file_path) {
            Ok((imported, skipped)) => {
                result.imported += imported;
                result.skipped += skipped;
            }
            Err(e) => {
                let msg = format!("{}: {e}", file_path.display());
                log::warn!("[GROK-SYNC] 文件解析失败: {msg}");
                result.errors.push(msg);
            }
        }
    }

    if result.imported > 0 {
        log::info!(
            "[GROK-SYNC] 同步完成: 导入 {} 条, 跳过 {} 条, 扫描 {} 个文件",
            result.imported,
            result.skipped,
            result.files_scanned
        );
    }

    Ok(result)
}

/// 收集所有 Grok 相关的 JSONL 文件（events / chat_history / updates）
fn collect_grok_jsonl_files(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();

    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    walk(&p, out);
                } else if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                    if name.ends_with(".jsonl")
                        && (name.contains("events")
                            || name.contains("chat_history")
                            || name.contains("updates"))
                    {
                        out.push(p.clone());
                    }
                }
            }
        }
    }

    walk(root, &mut files);
    files
}

/// 解析单个 Grok JSONL 文件
fn sync_single_grok_file(db: &Database, file_path: &Path) -> Result<(u32, u32), AppError> {
    let file_path_str = file_path.to_string_lossy().to_string();

    let metadata = fs::metadata(file_path)
        .map_err(|e| AppError::Config(format!("无法读取 Grok 日志元数据: {e}")))?;
    let file_modified = metadata_modified_nanos(&metadata);

    let (last_modified, _last_offset) = get_sync_state(db, &file_path_str)?;
    if file_modified <= last_modified {
        return Ok((0, 0));
    }

    let file = fs::File::open(file_path)
        .map_err(|e| AppError::Config(format!("无法打开 Grok 日志: {e}")))?;
    let reader = BufReader::new(file);

    let mut imported = 0u32;
    let mut skipped = 0u32;
    let mut records: Vec<GrokUsageRecord> = Vec::new();
    let mut line_count: i64 = 0;

    let session_id_from_path = file_path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    for line in reader.lines() {
        line_count += 1;
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

        // 尝试从 turn_started 拿 model
        if value.get("type").and_then(|t| t.as_str()) == Some("turn_started") {
            if let Some(model) = value.get("model_id").and_then(|m| m.as_str()) {
                let ts = value.get("ts").and_then(|t| t.as_str()).map(|s| s.to_string());
                records.push(GrokUsageRecord {
                    model: model.to_string(),
                    total_tokens: 0,
                    timestamp: ts,
                    session_id: session_id_from_path.clone(),
                    turn_or_event: format!("turn-{}", value.get("turn_number").and_then(|n| n.as_i64()).unwrap_or(0)),
                });
            }
        }

        // 从 assistant 消息拿 model
        if value.get("type").and_then(|t| t.as_str()) == Some("assistant") {
            if let Some(model) = value.get("model_id").and_then(|m| m.as_str()) {
                let ts = value.get("_meta").and_then(|m| m.get("agentTimestampMs")).and_then(|t| t.as_str().map(|s| s.to_string()))
                    .or_else(|| value.get("ts").and_then(|t| t.as_str()).map(|s| s.to_string()));

                // 尝试提取 totalTokens
                let total = value
                    .get("_meta")
                    .and_then(|m| m.get("totalTokens"))
                    .and_then(|t| t.as_u64())
                    .unwrap_or(0) as u32;

                records.push(GrokUsageRecord {
                    model: model.to_string(),
                    total_tokens: total,
                    timestamp: ts,
                    session_id: session_id_from_path.clone(),
                    turn_or_event: "assistant".to_string(),
                });
            }
        }

        // 从 updates 的 _meta 里也抓 totalTokens + model（通过外层 modelId）
        if let Some(params) = value.get("params") {
            if let Some(meta) = params.get("_meta") {
                if let Some(total) = meta.get("totalTokens").and_then(|t| t.as_u64()) {
                    let model = meta
                        .get("modelId")
                        .and_then(|m| m.as_str())
                        .unwrap_or("grok")
                        .to_string();
                    let ts = meta.get("agentTimestampMs").and_then(|t| t.as_str().map(|s| s.to_string()));
                    records.push(GrokUsageRecord {
                        model,
                        total_tokens: total as u32,
                        timestamp: ts,
                        session_id: session_id_from_path.clone(),
                        turn_or_event: "update".to_string(),
                    });
                }
            }
        }
    }

    // 去重 + 插入（按 session + turn 粗去重）
    let mut seen = std::collections::HashSet::new();
    for rec in records {
        let key = format!("{}:{}:{}", rec.session_id, rec.turn_or_event, rec.model);
        if seen.contains(&key) {
            continue;
        }
        seen.insert(key);

        // 粗略拆分：total 的一半当 input，一半当 output（Grok 实际多为 output heavy，此处仅为占位）
        let input = rec.total_tokens / 3;
        let output = rec.total_tokens.saturating_sub(input);

        let request_id = format!(
            "grok_session:{}:{}",
            rec.session_id, rec.turn_or_event
        );

        match insert_grok_session_entry(db, &request_id, &rec, input, output) {
            Ok(true) => imported += 1,
            Ok(false) => skipped += 1,
            Err(e) => {
                log::warn!("[GROK-SYNC] 插入失败 {}: {e}", request_id);
                skipped += 1;
            }
        }
    }

    update_sync_state(db, &file_path_str, file_modified, line_count)?;

    Ok((imported, skipped))
}

/// 插入 Grok 会话记录
fn insert_grok_session_entry(
    db: &Database,
    request_id: &str,
    rec: &GrokUsageRecord,
    input_tokens: u32,
    output_tokens: u32,
) -> Result<bool, AppError> {
    let conn = lock_conn!(db.conn);

    let created_at = rec
        .timestamp
        .as_ref()
        .and_then(|ts| {
            // 可能是 ms 或 rfc3339
            if let Ok(n) = ts.parse::<i64>() {
                Some(if n > 1_000_000_000_000 { n / 1000 } else { n })
            } else {
                chrono::DateTime::parse_from_rfc3339(ts)
                    .ok()
                    .map(|dt| dt.timestamp())
            }
        })
        .unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0)
        });

    let dedup_key = DedupKey {
        app_type: "grok",
        model: &rec.model,
        input_tokens,
        output_tokens,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        created_at,
    };

    if should_skip_session_insert(&conn, request_id, &dedup_key)? {
        return Ok(false);
    }

    let usage = TokenUsage {
        input_tokens,
        output_tokens,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        model: Some(rec.model.clone()),
        message_id: None,
    };

    let multiplier = Decimal::from(1);
    let (
        input_cost,
        output_cost,
        cache_read_cost,
        cache_creation_cost,
        total_cost,
    ) = match find_model_pricing(&conn, &rec.model) {
        Some(p) => {
            let c = CostCalculator::calculate(&usage, &p, multiplier);
            (
                c.input_cost.to_string(),
                c.output_cost.to_string(),
                c.cache_read_cost.to_string(),
                c.cache_creation_cost.to_string(),
                c.total_cost.to_string(),
            )
        }
        None => (
            "0".to_string(),
            "0".to_string(),
            "0".to_string(),
            "0".to_string(),
            "0".to_string(),
        ),
    };

    let model = &rec.model;

    let inserted_rows = conn
        .execute(
            "INSERT OR IGNORE INTO proxy_request_logs (
                request_id, provider_id, app_type, model, request_model,
                input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
                input_cost_usd, output_cost_usd, cache_read_cost_usd, cache_creation_cost_usd, total_cost_usd,
                latency_ms, first_token_ms, status_code, error_message, session_id,
                provider_type, is_streaming, cost_multiplier, created_at, data_source
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)",
            rusqlite::params![
                request_id,
                "_session",            // provider_id
                "grok",                // app_type
                model,
                model,                 // request_model
                input_tokens as i64,
                output_tokens as i64,
                0i64,                  // cache_read_tokens (Grok direct logs rarely expose cache split)
                0i64,                  // cache_creation_tokens
                input_cost,
                output_cost,
                cache_read_cost,
                cache_creation_cost,
                total_cost,
                0i64,                  // latency_ms
                Option::<i64>::None,   // first_token_ms
                200i64,                // status_code
                Option::<String>::None, // error_message
                Some(&rec.session_id), // session_id
                Some("session_log"),   // provider_type
                1i64,                  // is_streaming (Grok is typically streaming)
                "1.0",                 // cost_multiplier
                created_at,
                "grok_session",        // data_source
            ],
        )
        .map_err(|e| AppError::Database(format!("插入 Grok 会话记录失败: {e}")))?;

    if inserted_rows > 0 {
        crate::usage_events::notify_log_recorded();
    }

    Ok(true)
}
