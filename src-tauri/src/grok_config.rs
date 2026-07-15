//! Grok Build CLI (`grok`) live configuration.
//!
//! Dual-file layout (similar to Codex):
//! - `~/.grok/auth.json` — OIDC session bundle or empty for API-key mode
//! - `~/.grok/config.toml` — models, UI, marketplace, custom `[model.*]`, etc.
//!
//! Home directory: `$GROK_HOME` if set, else `~/.grok`.

use std::path::PathBuf;

use serde_json::{json, Map, Value};
use toml_edit::{DocumentMut, Item, Table};

use crate::config::{delete_file, get_home_dir, read_json_file, write_json_file, write_text_file};
use crate::error::AppError;
use crate::settings::get_grok_override_dir;

const AUTH_FILENAME: &str = "auth.json";
const CONFIG_FILENAME: &str = "config.toml";

/// Resolve Grok home: settings override → GROK_HOME → ~/.grok
pub fn get_grok_config_dir() -> PathBuf {
    if let Some(dir) = get_grok_override_dir() {
        return dir;
    }
    if let Ok(home) = std::env::var("GROK_HOME") {
        let trimmed = home.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    get_home_dir().join(".grok")
}

pub fn get_grok_auth_path() -> PathBuf {
    get_grok_config_dir().join(AUTH_FILENAME)
}

pub fn get_grok_config_path() -> PathBuf {
    get_grok_config_dir().join(CONFIG_FILENAME)
}

pub fn ensure_grok_dir() -> Result<PathBuf, AppError> {
    let dir = get_grok_config_dir();
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| AppError::io(&dir, e))?;
    }
    Ok(dir)
}

/// Read live auth.json (empty object if missing).
pub fn read_grok_auth() -> Result<Value, AppError> {
    let path = get_grok_auth_path();
    if !path.exists() {
        return Ok(json!({}));
    }
    read_json_file(&path)
}

/// Write auth.json (empty object deletes file for cleanliness).
pub fn write_grok_auth(auth: &Value) -> Result<(), AppError> {
    ensure_grok_dir()?;
    let path = get_grok_auth_path();
    if auth.as_object().map(|o| o.is_empty()).unwrap_or(false) {
        if path.exists() {
            delete_file(&path)?;
        }
        return Ok(());
    }
    write_json_file(&path, auth)
}

/// Read live config.toml as string (empty if missing).
pub fn read_grok_config_text() -> Result<String, AppError> {
    let path = get_grok_config_path();
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).map_err(|e| AppError::io(&path, e))
}

pub fn write_grok_config_text(text: &str) -> Result<(), AppError> {
    ensure_grok_dir()?;
    let path = get_grok_config_path();
    write_text_file(&path, text)
}

/// Provider `settings_config` shape for Grok:
/// ```json
/// { "auth": { ... }, "config": "<toml string>" }
/// ```
pub fn provider_settings_from_live() -> Result<Value, AppError> {
    let auth = read_grok_auth()?;
    let config = read_grok_config_text()?;
    Ok(json!({
        "auth": auth,
        "config": config,
    }))
}

/// Write a Grok provider's settings to live files.
///
/// Strategy:
/// - `auth` is written as a whole file snapshot.
/// - `config` is written as a whole TOML snapshot (backfill keeps per-provider UI prefs).
/// - `apiKey` (optional) is written into `~/.grok/.env` for keys referenced by
///   `env_key` in config.toml (Grok CLI reads API keys from process env).
pub fn write_grok_provider_live(settings_config: &Value) -> Result<(), AppError> {
    let obj = settings_config
        .as_object()
        .ok_or_else(|| AppError::Config("Grok 供应商配置必须是 JSON 对象".to_string()))?;

    let auth = obj.get("auth").cloned().unwrap_or_else(|| json!({}));
    write_grok_auth(&auth)?;

    let config = obj.get("config").and_then(|v| v.as_str()).unwrap_or("");
    write_grok_config_text(config)?;

    // BYOK: sync apiKey → ~/.grok/.env under env_key names from config
    let api_key = obj
        .get("apiKey")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let mut env_keys = extract_env_keys_from_toml(config);
    if env_keys.is_empty() {
        // Default official API-key mode uses XAI_API_KEY
        env_keys.push("XAI_API_KEY".to_string());
    }
    write_grok_dotenv(api_key, &env_keys)?;

    Ok(())
}

/// Collect unique `env_key` values from `[model.*]` tables in config.toml.
fn extract_env_keys_from_toml(config_toml: &str) -> Vec<String> {
    let Ok(doc) = config_toml.parse::<DocumentMut>() else {
        return Vec::new();
    };
    let mut keys = Vec::new();
    let Some(model_root) = doc.get("model").and_then(|i| i.as_table()) else {
        return keys;
    };
    for (_name, item) in model_root.iter() {
        if let Some(table) = item.as_table() {
            if let Some(env_key) = table
                .get("env_key")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                if !keys.iter().any(|k| k == env_key) {
                    keys.push(env_key.to_string());
                }
            }
        }
    }
    keys
}

fn get_grok_dotenv_path() -> PathBuf {
    get_grok_config_dir().join(".env")
}

/// Upsert or remove managed env vars in `~/.grok/.env` (preserves other lines).
fn write_grok_dotenv(api_key: Option<&str>, env_var_names: &[String]) -> Result<(), AppError> {
    if env_var_names.is_empty() {
        return Ok(());
    }
    ensure_grok_dir()?;
    let path = get_grok_dotenv_path();

    let existing = if path.exists() {
        std::fs::read_to_string(&path).map_err(|e| AppError::io(&path, e))?
    } else {
        String::new()
    };

    let managed: std::collections::HashSet<&str> =
        env_var_names.iter().map(String::as_str).collect();

    let mut kept_lines: Vec<String> = Vec::new();
    for line in existing.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            kept_lines.push(line.to_string());
            continue;
        }
        let key = trimmed.split('=').next().unwrap_or("").trim();
        if managed.contains(key) {
            continue; // drop old managed keys; re-add below if needed
        }
        kept_lines.push(line.to_string());
    }

    if let Some(key_value) = api_key {
        // Quote if needed for spaces/specials
        let escaped = key_value.replace('\\', "\\\\").replace('"', "\\\"");
        for name in env_var_names {
            kept_lines.push(format!("{name}=\"{escaped}\""));
        }
    }

    let content = if kept_lines.is_empty() {
        String::new()
    } else {
        let mut s = kept_lines.join("\n");
        if !s.ends_with('\n') {
            s.push('\n');
        }
        s
    };

    if content.trim().is_empty() {
        if path.exists() {
            delete_file(&path)?;
        }
        return Ok(());
    }

    write_text_file(&path, &content)
}

/// Build a BYOK / custom-model provider config by merging a model entry into a base TOML.
///
/// Preserves unrelated sections from `base_toml` (ui/cli/marketplace/mcp/etc.).
pub fn build_byok_config_toml(
    base_toml: &str,
    model_key: &str,
    model_id: &str,
    base_url: &str,
    display_name: &str,
    env_key: &str,
    api_backend: &str,
) -> Result<String, AppError> {
    let mut doc = if base_toml.trim().is_empty() {
        DocumentMut::new()
    } else {
        base_toml
            .parse::<DocumentMut>()
            .map_err(|e| AppError::Config(format!("解析 Grok config.toml 失败: {e}")))?
    };

    // [models].default
    {
        let models = doc["models"].or_insert(Item::Table(Table::new()));
        if let Some(t) = models.as_table_mut() {
            t["default"] = toml_edit::value(model_key);
        }
    }

    // [model.<key>]
    {
        let model_table = doc["model"].or_insert(Item::Table(Table::new()));
        let root = model_table
            .as_table_mut()
            .ok_or_else(|| AppError::Config("[model] 段必须是 table".to_string()))?;
        let mut entry = Table::new();
        entry["model"] = toml_edit::value(model_id);
        entry["base_url"] = toml_edit::value(base_url);
        entry["name"] = toml_edit::value(display_name);
        if !env_key.is_empty() {
            entry["env_key"] = toml_edit::value(env_key);
        }
        if !api_backend.is_empty() {
            entry["api_backend"] = toml_edit::value(api_backend);
        }
        root[model_key] = Item::Table(entry);
    }

    Ok(doc.to_string())
}

/// Extract a short label from OIDC auth (email if present).
pub fn auth_display_hint(auth: &Value) -> Option<String> {
    let obj = auth.as_object()?;
    for (_k, v) in obj {
        if let Some(email) = v.get("email").and_then(|e| e.as_str()) {
            if !email.is_empty() {
                return Some(email.to_string());
            }
        }
        if let Some(mode) = v.get("auth_mode").and_then(|m| m.as_str()) {
            return Some(mode.to_string());
        }
    }
    if obj.is_empty() {
        None
    } else {
        Some("oidc".to_string())
    }
}

/// Normalize provider settings for DB storage.
pub fn normalize_settings(mut settings: Value) -> Value {
    if !settings.is_object() {
        return json!({ "auth": {}, "config": "" });
    }
    let map = settings.as_object_mut().unwrap();
    if !map.contains_key("auth") {
        map.insert("auth".into(), json!({}));
    }
    if !map.contains_key("config") {
        map.insert("config".into(), json!(""));
    } else if let Some(cfg) = map.get("config") {
        if cfg.is_object() {
            // Allow passing structured TOML-as-JSON and stringify later — keep as-is only if string
            map.insert("config".into(), json!(""));
        }
    }
    // Keep optional apiKey (BYOK) as-is when present and string
    if let Some(key) = map.get("apiKey") {
        if !key.is_string() {
            map.remove("apiKey");
        }
    }
    settings
}

/// Whether live grok files exist.
pub fn live_exists() -> bool {
    get_grok_auth_path().exists() || get_grok_config_path().exists()
}

/// Snapshot live into a plain map for debugging / import.
pub fn live_status() -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("dir".into(), json!(get_grok_config_dir().to_string_lossy()));
    m.insert("authExists".into(), json!(get_grok_auth_path().exists()));
    m.insert(
        "configExists".into(),
        json!(get_grok_config_path().exists()),
    );
    m
}
