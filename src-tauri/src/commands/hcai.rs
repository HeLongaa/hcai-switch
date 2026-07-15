//! HCAI 中转站：额度查询 / 公开设置 / OAuth 登录（绕过 WebView CORS）
//!
//! 主站不可达时按顺序尝试区域备用节点。

use serde_json::Value;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

/// 用量路径（挂在各区域网关 `/v1` 下）
const USAGE_PATH: &str = "/v1/usage";
/// 公开站点设置（登录协议等，无需鉴权）
const PUBLIC_SETTINGS_PATH: &str = "/api/v1/settings/public";
/// 邮箱密码登录
const LOGIN_PATH: &str = "/api/v1/auth/login";
/// OAuth 起始（系统浏览器内完成授权后回到站点 callback hash）
const OAUTH_GITHUB_START_PATH: &str = "/api/v1/auth/oauth/github/start";
const OAUTH_GOOGLE_START_PATH: &str = "/api/v1/auth/oauth/google/start";
/// 登录用户信息
const AUTH_ME_PATH: &str = "/api/v1/auth/me";
/// OAuth 成功后的站内回调路径
const OAUTH_CALLBACK_REDIRECT: &str = "/auth/oauth/callback";
/// HCAI 前端识别后会桥接到 `ccswitch://hcai/oauth/callback`。
const OAUTH_DESKTOP_CLIENT: &str = "ccswitch";
const OAUTH_DEEP_LINK_HOST: &str = "hcai";
const OAUTH_DEEP_LINK_PATH: &str = "/oauth/callback";
const OAUTH_RESULT_EVENT: &str = "hcai-oauth-result";
const OAUTH_PENDING_FILE: &str = ".hcai-oauth-pending.json";
/// OAuth 独立窗口 label
const OAUTH_WINDOW_LABEL: &str = "hcai-oauth";
/// 主站优先，其后为区域备用
const HCAI_GATEWAY_ROOTS: &[&str] = &[
    "https://ai.hctopup.com",
    "https://ai-us.hctopup.com",
    "https://ai-prod.hctopup.com",
];
const FETCH_TIMEOUT_SECS: u64 = 20;
/// OAuth 等待用户授权的最长时间
const OAUTH_TIMEOUT_SECS: u64 = 300;
const OAUTH_PENDING_MAX_AGE_SECS: u64 = 10 * 60;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HcaiOAuthCompletion {
    request_id: String,
    result: Option<Value>,
    error: Option<String>,
}

#[derive(serde::Deserialize, serde::Serialize)]
struct HcaiOAuthPendingRequest {
    request_id: String,
    created_at: u64,
}

static HCAI_OAUTH_COMPLETION: OnceLock<Mutex<Option<HcaiOAuthCompletion>>> = OnceLock::new();

fn oauth_completion_slot() -> &'static Mutex<Option<HcaiOAuthCompletion>> {
    HCAI_OAUTH_COMPLETION.get_or_init(|| Mutex::new(None))
}

/// 查询 HCAI 密钥额度 / 用量
///
/// `GET {gateway}/v1/usage?...` + `Authorization: Bearer <api_key>`
/// 主站连接失败或 5xx 时自动切换备用网关。
#[tauri::command(rename_all = "camelCase")]
pub async fn fetch_hcai_usage(
    api_key: String,
    start_date: Option<String>,
    end_date: Option<String>,
    days: Option<u32>,
    timezone: Option<String>,
) -> Result<Value, String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Err("API Key is required".to_string());
    }

    let days = days.unwrap_or(30);
    let tz = timezone.unwrap_or_else(|| "Asia/Shanghai".to_string());

    let client = crate::proxy::http_client::get();
    let mut last_err = String::from("HCAI usage: all endpoints failed");

    for root in HCAI_GATEWAY_ROOTS {
        let mut url = match reqwest::Url::parse(&format!("{root}{USAGE_PATH}")) {
            Ok(u) => u,
            Err(e) => {
                last_err = format!("HCAI usage invalid URL for {root}: {e}");
                continue;
            }
        };
        {
            let mut qp = url.query_pairs_mut();
            qp.append_pair("days", &days.to_string());
            qp.append_pair("timezone", &tz);
            if let Some(s) = start_date.as_deref().filter(|s| !s.is_empty()) {
                qp.append_pair("start_date", s);
            }
            if let Some(e) = end_date.as_deref().filter(|e| !e.is_empty()) {
                qp.append_pair("end_date", e);
            }
        }

        let response = match client
            .get(url)
            .header("Authorization", format!("Bearer {key}"))
            .header("Accept", "application/json")
            .timeout(Duration::from_secs(FETCH_TIMEOUT_SECS))
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                // 连接失败 / 超时 → 尝试下一个备用节点
                last_err = format!("HCAI usage request failed ({root}): {e}");
                continue;
            }
        };

        let status = response.status();
        let body = match response.text().await {
            Ok(b) => b,
            Err(e) => {
                last_err = format!("HCAI usage read body failed ({root}): {e}");
                continue;
            }
        };

        if status.is_server_error() {
            // 5xx 视为该节点不可用，换备用
            let snippet: String = body.chars().take(200).collect();
            last_err = format!("HCAI usage HTTP {status} ({root}): {snippet}");
            continue;
        }

        if !status.is_success() {
            // 4xx（鉴权失败等）对所有节点通常一致，直接返回，避免无意义重试
            let snippet: String = body.chars().take(300).collect();
            return Err(format!("HCAI usage HTTP {status}: {snippet}"));
        }

        return serde_json::from_str::<Value>(&body)
            .map_err(|e| format!("HCAI usage invalid JSON ({root}): {e}"));
    }

    Err(last_err)
}

/// 拉取 HCAI 公开站点设置（登录协议文档等）
///
/// `GET {gateway}/api/v1/settings/public?timezone=...`
/// 成功时返回 API 的 `data` 对象（非完整 envelope）。
#[tauri::command(rename_all = "camelCase")]
pub async fn fetch_hcai_public_settings(timezone: Option<String>) -> Result<Value, String> {
    let tz = timezone.unwrap_or_else(|| "Asia/Shanghai".to_string());
    let client = crate::proxy::http_client::get();
    let mut last_err = String::from("HCAI public settings: all endpoints failed");

    for root in HCAI_GATEWAY_ROOTS {
        let mut url = match reqwest::Url::parse(&format!("{root}{PUBLIC_SETTINGS_PATH}")) {
            Ok(u) => u,
            Err(e) => {
                last_err = format!("HCAI public settings invalid URL for {root}: {e}");
                continue;
            }
        };
        url.query_pairs_mut().append_pair("timezone", &tz);

        let response = match client
            .get(url)
            .header("Accept", "application/json")
            .header("Pragma", "no-cache")
            .timeout(Duration::from_secs(FETCH_TIMEOUT_SECS))
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("HCAI public settings request failed ({root}): {e}");
                continue;
            }
        };

        let status = response.status();
        let body = match response.text().await {
            Ok(b) => b,
            Err(e) => {
                last_err = format!("HCAI public settings read body failed ({root}): {e}");
                continue;
            }
        };

        if status.is_server_error() {
            let snippet: String = body.chars().take(200).collect();
            last_err = format!("HCAI public settings HTTP {status} ({root}): {snippet}");
            continue;
        }

        if !status.is_success() {
            let snippet: String = body.chars().take(300).collect();
            return Err(format!("HCAI public settings HTTP {status}: {snippet}"));
        }

        let envelope: Value = serde_json::from_str(&body)
            .map_err(|e| format!("HCAI public settings invalid JSON ({root}): {e}"))?;

        // 兼容 `{ code, data }` 与直接 data 两种形态
        if let Some(data) = envelope.get("data") {
            if envelope
                .get("code")
                .and_then(|c| c.as_i64())
                .is_some_and(|c| c != 0)
            {
                let msg = envelope
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("unknown error");
                return Err(format!("HCAI public settings API error: {msg}"));
            }
            return Ok(data.clone());
        }

        if envelope.is_object() {
            return Ok(envelope);
        }

        last_err = format!("HCAI public settings unexpected payload ({root})");
    }

    Err(last_err)
}

/// 邮箱密码登录 HCAI
///
/// `POST {gateway}/api/v1/auth/login` + JSON `{ email, password }`
/// 成功时返回 API 的 `data`（含 access_token / refresh_token / user）。
#[tauri::command(rename_all = "camelCase")]
pub async fn hcai_login(email: String, password: String) -> Result<Value, String> {
    let email = email.trim();
    if email.is_empty() {
        return Err("Email is required".to_string());
    }
    if password.is_empty() {
        return Err("Password is required".to_string());
    }

    let client = crate::proxy::http_client::get();
    let mut last_err = String::from("HCAI login: all endpoints failed");
    let body = serde_json::json!({
        "email": email,
        "password": password,
    });

    for root in HCAI_GATEWAY_ROOTS {
        let url = match reqwest::Url::parse(&format!("{root}{LOGIN_PATH}")) {
            Ok(u) => u,
            Err(e) => {
                last_err = format!("HCAI login invalid URL for {root}: {e}");
                continue;
            }
        };

        let response = match client
            .post(url)
            .header("Accept", "application/json, text/plain, */*")
            .header("Content-Type", "application/json")
            .header("Pragma", "no-cache")
            .header("Cache-Control", "no-cache")
            .timeout(Duration::from_secs(FETCH_TIMEOUT_SECS))
            .json(&body)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("HCAI login request failed ({root}): {e}");
                continue;
            }
        };

        let status = response.status();
        let text = match response.text().await {
            Ok(b) => b,
            Err(e) => {
                last_err = format!("HCAI login read body failed ({root}): {e}");
                continue;
            }
        };

        if status.is_server_error() {
            let snippet: String = text.chars().take(200).collect();
            last_err = format!("HCAI login HTTP {status} ({root}): {snippet}");
            continue;
        }

        let envelope: Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(e) => {
                if !status.is_success() {
                    let snippet: String = text.chars().take(300).collect();
                    return Err(format!("HCAI login HTTP {status}: {snippet}"));
                }
                last_err = format!("HCAI login invalid JSON ({root}): {e}");
                continue;
            }
        };

        let code = envelope.get("code").and_then(|c| c.as_i64());
        if code.is_some_and(|c| c != 0) {
            let msg = envelope
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("login failed");
            // 业务错误（密码错误等）不切换节点
            return Err(msg.to_string());
        }

        if !status.is_success() {
            let msg = envelope
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("login failed");
            return Err(format!("HCAI login HTTP {status}: {msg}"));
        }

        if let Some(data) = envelope.get("data") {
            if data.get("access_token").and_then(|t| t.as_str()).is_none() {
                return Err("HCAI login response missing access_token".to_string());
            }
            return Ok(data.clone());
        }

        last_err = format!("HCAI login unexpected payload ({root})");
    }

    Err(last_err)
}

/// 从 OAuth 回调 URL 的 hash / query 解析本站 token。
///
/// 期望形态：
/// - `https://ai.hctopup.com/auth/oauth/callback#access_token=...&refresh_token=...`
/// - 仅 hash / query 片段：`#access_token=...` 或 `access_token=...`
/// - 桌面桥接：`ccswitch://hcai/oauth/callback?...#access_token=...`
fn parse_oauth_callback_tokens(url_str: &str) -> Option<OAuthTokenBundle> {
    let trimmed = url_str.trim();
    if trimmed.is_empty() || !trimmed.contains("access_token=") {
        return None;
    }

    // 允许用户只粘贴 hash / query 片段
    let normalized = if trimmed.contains("://") {
        trimmed.to_string()
    } else if trimmed.starts_with('#') {
        format!("https://ai.hctopup.com{OAUTH_CALLBACK_REDIRECT}{trimmed}")
    } else if trimmed.starts_with('?') {
        format!("https://ai.hctopup.com{OAUTH_CALLBACK_REDIRECT}{trimmed}")
    } else {
        format!("https://ai.hctopup.com{OAUTH_CALLBACK_REDIRECT}#{trimmed}")
    };

    let url = url::Url::parse(&normalized).ok()?;

    // 优先 fragment（hash），其次 query
    let pairs_src = url
        .fragment()
        .filter(|f| f.contains("access_token"))
        .map(|f| f.to_string())
        .or_else(|| {
            if url.query().is_some_and(|q| q.contains("access_token")) {
                url.query().map(|q| q.to_string())
            } else {
                None
            }
        })?;

    let mut access_token = None::<String>;
    let mut refresh_token = None::<String>;
    let mut expires_in: u64 = 86400;
    let mut token_type = "Bearer".to_string();

    for pair in pairs_src.split('&') {
        let mut it = pair.splitn(2, '=');
        let k = it.next().unwrap_or("");
        let v = it.next().unwrap_or("");
        let decoded = urlencoding_decode(v);
        match k {
            "access_token" if !decoded.is_empty() => access_token = Some(decoded),
            "refresh_token" if !decoded.is_empty() => refresh_token = Some(decoded),
            "expires_in" => {
                if let Ok(n) = decoded.parse::<u64>() {
                    expires_in = n;
                }
            }
            "token_type" if !decoded.is_empty() => token_type = decoded,
            _ => {}
        }
    }

    let access_token = access_token?;
    Some(OAuthTokenBundle {
        access_token,
        refresh_token: refresh_token.unwrap_or_default(),
        expires_in,
        token_type,
    })
}

/// 极简 percent-decode（token 通常无需复杂解码）
fn urlencoding_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hex = &s[i + 1..i + 3];
                if let Ok(b) = u8::from_str_radix(hex, 16) {
                    out.push(b);
                    i += 3;
                } else {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[derive(Clone)]
struct OAuthTokenBundle {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
    token_type: String,
}

/// 用 access_token 拉 `/api/v1/auth/me`，组装与密码登录一致的 data。
async fn hcai_login_result_from_tokens(tokens: OAuthTokenBundle) -> Result<Value, String> {
    let user = hcai_api_request("GET", AUTH_ME_PATH, &tokens.access_token, None, None).await?;
    if user.get("email").and_then(|e| e.as_str()).is_none() && user.get("id").is_none() {
        return Err("HCAI OAuth: /auth/me 未返回有效用户".to_string());
    }
    Ok(serde_json::json!({
        "access_token": tokens.access_token,
        "refresh_token": tokens.refresh_token,
        "expires_in": tokens.expires_in,
        "token_type": tokens.token_type,
        "user": user,
    }))
}

fn oauth_pending_path() -> std::path::PathBuf {
    crate::config::get_app_config_dir().join(OAUTH_PENDING_FILE)
}

fn unix_timestamp_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn write_oauth_pending(request_id: &str) -> Result<(), String> {
    let path = oauth_pending_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("HCAI OAuth: 无法创建状态目录: {e}"))?;
    }
    let payload = HcaiOAuthPendingRequest {
        request_id: request_id.to_string(),
        created_at: unix_timestamp_secs(),
    };
    let data =
        serde_json::to_vec(&payload).map_err(|e| format!("HCAI OAuth: 无法序列化登录状态: {e}"))?;
    std::fs::write(path, data).map_err(|e| format!("HCAI OAuth: 无法保存登录状态: {e}"))
}

fn read_oauth_pending() -> Option<HcaiOAuthPendingRequest> {
    let data = std::fs::read(oauth_pending_path()).ok()?;
    serde_json::from_slice(&data).ok()
}

fn clear_oauth_pending_if_matches(request_id: &str) {
    let should_clear = read_oauth_pending().is_some_and(|pending| pending.request_id == request_id);
    if should_clear {
        let _ = std::fs::remove_file(oauth_pending_path());
    }
}

fn is_oauth_pending_valid(pending: &HcaiOAuthPendingRequest, request_id: &str, now: u64) -> bool {
    pending.request_id == request_id
        && pending.created_at <= now
        && now - pending.created_at <= OAUTH_PENDING_MAX_AGE_SECS
}

fn desktop_oauth_redirect(request_id: &str) -> String {
    let mut target = url::Url::parse("https://ai.hctopup.com/auth/oauth/callback")
        .expect("static HCAI OAuth callback URL must be valid");
    target
        .query_pairs_mut()
        .append_pair("client", OAUTH_DESKTOP_CLIENT)
        .append_pair("request_id", request_id);
    format!("{}?{}", target.path(), target.query().unwrap_or_default())
}

fn parse_hcai_oauth_deep_link(url_str: &str) -> Result<(String, OAuthTokenBundle), String> {
    let url = url::Url::parse(url_str).map_err(|_| "无效的 HCAI OAuth 回调".to_string())?;
    if url.scheme() != "ccswitch"
        || url.host_str() != Some(OAUTH_DEEP_LINK_HOST)
        || url.path() != OAUTH_DEEP_LINK_PATH
    {
        return Err("不是 HCAI OAuth 回调".to_string());
    }

    let request_ids: Vec<String> = url
        .query_pairs()
        .filter(|(key, _)| key == "request_id")
        .map(|(_, value)| value.into_owned())
        .collect();
    if request_ids.len() != 1 || uuid::Uuid::parse_str(&request_ids[0]).is_err() {
        return Err("HCAI OAuth 回调缺少有效 request_id".to_string());
    }

    let tokens = parse_oauth_callback_tokens(url_str)
        .ok_or_else(|| "HCAI OAuth 回调缺少 access_token".to_string())?;
    Ok((request_ids[0].clone(), tokens))
}

fn publish_oauth_completion(app: &tauri::AppHandle, completion: HcaiOAuthCompletion) {
    let request_id = completion.request_id.clone();
    if let Ok(mut slot) = oauth_completion_slot().lock() {
        *slot = Some(completion);
    } else {
        log::error!("HCAI OAuth completion state lock poisoned");
        return;
    }

    if let Err(e) = app.emit(
        OAUTH_RESULT_EVENT,
        serde_json::json!({ "requestId": request_id }),
    ) {
        log::warn!("HCAI OAuth result event could not be emitted: {e}");
    }
}

/// 在通用 deep-link 导入前处理 HCAI OAuth 回调。
///
/// 返回 `true` 表示 URL 属于 HCAI OAuth（包括无效/过期回调），调用方不得再把它
/// 当作配置导入，也不得记录包含 token 的原始 URL。
pub fn handle_hcai_oauth_callback(app: &tauri::AppHandle, url_str: &str) -> bool {
    let Ok(url) = url::Url::parse(url_str) else {
        return false;
    };
    if url.scheme() != "ccswitch"
        || url.host_str() != Some(OAUTH_DEEP_LINK_HOST)
        || url.path() != OAUTH_DEEP_LINK_PATH
    {
        return false;
    }

    let (request_id, tokens) = match parse_hcai_oauth_deep_link(url_str) {
        Ok(value) => value,
        Err(e) => {
            log::warn!("Rejected HCAI OAuth callback: {e}");
            return true;
        }
    };

    let Some(pending) = read_oauth_pending() else {
        log::warn!("Rejected HCAI OAuth callback: no pending login");
        return true;
    };
    if !is_oauth_pending_valid(&pending, &request_id, unix_timestamp_secs()) {
        log::warn!("Rejected HCAI OAuth callback: request mismatch or expired");
        return true;
    }
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let completion = match hcai_login_result_from_tokens(tokens).await {
            Ok(result) => HcaiOAuthCompletion {
                request_id,
                result: Some(result),
                error: None,
            },
            Err(error) => HcaiOAuthCompletion {
                request_id,
                result: None,
                error: Some(error),
            },
        };
        let still_current =
            read_oauth_pending().is_some_and(|pending| pending.request_id == completion.request_id);
        if still_current {
            clear_oauth_pending_if_matches(&completion.request_id);
            publish_oauth_completion(&app_handle, completion);
        } else {
            log::info!("Discarded superseded HCAI OAuth result");
        }
    });
    true
}

fn hcai_oauth_start(app: &tauri::AppHandle, start_path: &str) -> Result<String, String> {
    let request_id = uuid::Uuid::new_v4().to_string();
    write_oauth_pending(&request_id)?;
    if let Ok(mut slot) = oauth_completion_slot().lock() {
        *slot = None;
    }

    let root = HCAI_GATEWAY_ROOTS[0];
    let mut start = url::Url::parse(&format!("{root}{start_path}"))
        .map_err(|e| format!("HCAI OAuth invalid start URL: {e}"))?;
    start
        .query_pairs_mut()
        .append_pair("redirect", &desktop_oauth_redirect(&request_id));

    if let Err(e) = app.opener().open_url(start.as_str(), None::<String>) {
        clear_oauth_pending_if_matches(&request_id);
        return Err(format!("无法打开系统浏览器: {e}"));
    }
    Ok(request_id)
}

/// 使用系统默认浏览器启动 GitHub OAuth，返回本次登录的 request_id。
#[tauri::command(rename_all = "camelCase")]
pub async fn hcai_oauth_github_start(app: tauri::AppHandle) -> Result<String, String> {
    hcai_oauth_start(&app, OAUTH_GITHUB_START_PATH)
}

/// 使用系统默认浏览器启动 Google OAuth，返回本次登录的 request_id。
#[tauri::command(rename_all = "camelCase")]
pub async fn hcai_oauth_google_start(app: tauri::AppHandle) -> Result<String, String> {
    hcai_oauth_start(&app, OAUTH_GOOGLE_START_PATH)
}

/// 取走一次 OAuth 完成结果；不传 request_id 时用于应用被 deep link 冷启动后的恢复。
#[tauri::command(rename_all = "camelCase")]
pub fn hcai_oauth_take_result(request_id: Option<String>) -> Option<HcaiOAuthCompletion> {
    let mut slot = oauth_completion_slot().lock().ok()?;
    if request_id.as_deref().is_some_and(|expected| {
        slot.as_ref()
            .is_some_and(|value| value.request_id != expected)
    }) {
        return None;
    }
    slot.take()
}

#[tauri::command(rename_all = "camelCase")]
pub fn hcai_oauth_cancel(request_id: String) {
    clear_oauth_pending_if_matches(&request_id);
}

/// GitHub OAuth 兼容回退：在独立 WebView 内走授权流。
///
/// 流程：
/// 1. 打开独立窗口加载 `{gateway}/api/v1/auth/oauth/github/start?redirect=/auth/oauth/callback`
/// 2. 用户在窗口内完成 GitHub 授权（state cookie 与回调须同一 WebView）
/// 3. 回调后 URL hash 带 access_token / refresh_token，窗口导航钩子拦截并关闭窗口
/// 4. 解析 token 并请求 `/api/v1/auth/me`，返回与 `hcai_login` 相同结构
#[tauri::command(rename_all = "camelCase")]
pub async fn hcai_oauth_github_webview_login(app: tauri::AppHandle) -> Result<Value, String> {
    // 关闭已有 OAuth 窗，避免重复
    if let Some(existing) = app.get_webview_window(OAUTH_WINDOW_LABEL) {
        let _ = existing.close();
        tokio::time::sleep(Duration::from_millis(150)).await;
    }

    let root = HCAI_GATEWAY_ROOTS[0];
    let mut start = url::Url::parse(&format!("{root}{OAUTH_GITHUB_START_PATH}"))
        .map_err(|e| format!("HCAI OAuth invalid start URL: {e}"))?;
    start
        .query_pairs_mut()
        .append_pair("redirect", OAUTH_CALLBACK_REDIRECT);

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<OAuthTokenBundle, String>>();
    let tx = Arc::new(Mutex::new(Some(tx)));

    let complete: Arc<dyn Fn(&str) -> bool + Send + Sync> = {
        let app_c = app.clone();
        let tx_c = Arc::clone(&tx);
        Arc::new(move |url_str: &str| -> bool {
            if let Some(tokens) = parse_oauth_callback_tokens(url_str) {
                if let Ok(mut guard) = tx_c.lock() {
                    if let Some(sender) = guard.take() {
                        let _ = sender.send(Ok(tokens));
                    }
                }
                if let Some(w) = app_c.get_webview_window(OAUTH_WINDOW_LABEL) {
                    let _ = w.close();
                }
                return true;
            }
            false
        })
    };

    let complete_nav = Arc::clone(&complete);
    let complete_load = Arc::clone(&complete);

    let window = WebviewWindowBuilder::new(&app, OAUTH_WINDOW_LABEL, WebviewUrl::External(start))
        .title("GitHub 登录 · HCAI")
        .inner_size(520.0, 780.0)
        .resizable(true)
        .center()
        .on_navigation(move |url| {
            // 拦截到 token 后返回 false 阻止继续导航
            !complete_nav(url.as_str())
        })
        .on_page_load(move |_window, payload| {
            // 部分平台 hash 主要出现在 page load
            let _ = complete_load(payload.url().as_str());
        })
        .build()
        .map_err(|e| format!("无法打开 GitHub 登录窗口: {e}"))?;

    let tx_close = Arc::clone(&tx);
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            if let Ok(mut guard) = tx_close.lock() {
                if let Some(sender) = guard.take() {
                    let _ = sender.send(Err("登录已取消".to_string()));
                }
            }
        }
    });

    let tokens = match tokio::time::timeout(Duration::from_secs(OAUTH_TIMEOUT_SECS), rx).await {
        Ok(Ok(Ok(t))) => t,
        Ok(Ok(Err(e))) => return Err(e),
        Ok(Err(_)) => return Err("登录已取消".to_string()),
        Err(_) => {
            if let Some(w) = app.get_webview_window(OAUTH_WINDOW_LABEL) {
                let _ = w.close();
            }
            return Err("登录超时，请重试".to_string());
        }
    };

    hcai_login_result_from_tokens(tokens).await
}

/// 已登录用户的 JSON API 请求（Bearer access_token）。
///
/// `method`: GET / POST / PUT / DELETE
/// `path` 须以 `/api/` 开头。
/// 成功时返回 envelope 的 `data`。
async fn hcai_api_request(
    method: &str,
    path: &str,
    access_token: &str,
    query: Option<&[(String, String)]>,
    body: Option<&Value>,
) -> Result<Value, String> {
    let path = path.trim();
    if !path.starts_with("/api/") {
        return Err("HCAI API path must start with /api/".to_string());
    }
    let token = access_token.trim();
    if token.is_empty() {
        return Err("Access token is required".to_string());
    }
    let method = method.trim().to_uppercase();
    if !matches!(method.as_str(), "GET" | "POST" | "PUT" | "PATCH" | "DELETE") {
        return Err(format!("Unsupported HCAI API method: {method}"));
    }

    let client = crate::proxy::http_client::get();
    let mut last_err = format!("HCAI API {method}: all endpoints failed");

    for root in HCAI_GATEWAY_ROOTS {
        let mut url = match reqwest::Url::parse(&format!("{root}{path}")) {
            Ok(u) => u,
            Err(e) => {
                last_err = format!("HCAI API invalid URL for {root}{path}: {e}");
                continue;
            }
        };
        if let Some(pairs) = query {
            let mut qp = url.query_pairs_mut();
            for (k, v) in pairs {
                if !k.is_empty() {
                    qp.append_pair(k, v);
                }
            }
        }

        let mut builder = client
            .request(
                method
                    .parse()
                    .map_err(|_| format!("Invalid HTTP method: {method}"))?,
                url,
            )
            .header("Authorization", format!("Bearer {token}"))
            .header("Accept", "application/json, text/plain, */*")
            .header("Pragma", "no-cache")
            .header("Cache-Control", "no-cache")
            .timeout(Duration::from_secs(FETCH_TIMEOUT_SECS));

        if let Some(b) = body {
            builder = builder.header("Content-Type", "application/json").json(b);
        }

        let response = match builder.send().await {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("HCAI API request failed ({root}{path}): {e}");
                continue;
            }
        };

        let status = response.status();
        let text = match response.text().await {
            Ok(b) => b,
            Err(e) => {
                last_err = format!("HCAI API read body failed ({root}{path}): {e}");
                continue;
            }
        };

        if status.as_u16() == 401 {
            return Err("HCAI unauthorized (401): please login again".to_string());
        }

        if status.is_server_error() {
            let snippet: String = text.chars().take(200).collect();
            last_err = format!("HCAI API HTTP {status} ({root}{path}): {snippet}");
            continue;
        }

        // DELETE 等可能无 body
        if text.trim().is_empty() {
            if status.is_success() {
                return Ok(Value::Null);
            }
            return Err(format!("HCAI API HTTP {status}: empty body"));
        }

        let envelope: Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(e) => {
                if !status.is_success() {
                    let snippet: String = text.chars().take(300).collect();
                    return Err(format!("HCAI API HTTP {status}: {snippet}"));
                }
                last_err = format!("HCAI API invalid JSON ({root}{path}): {e}");
                continue;
            }
        };

        let code = envelope.get("code").and_then(|c| c.as_i64());
        if code.is_some_and(|c| c != 0) {
            let msg = envelope
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("request failed");
            return Err(msg.to_string());
        }

        if !status.is_success() {
            let msg = envelope
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("request failed");
            return Err(format!("HCAI API HTTP {status}: {msg}"));
        }

        if let Some(data) = envelope.get("data") {
            return Ok(data.clone());
        }
        if envelope.is_object() && envelope.get("code").is_none() {
            return Ok(envelope);
        }
        // 成功但无 data 字段
        if status.is_success() {
            return Ok(Value::Null);
        }

        last_err = format!("HCAI API unexpected payload ({root}{path})");
    }

    Err(last_err)
}

/// 已登录 GET。
#[tauri::command(rename_all = "camelCase")]
pub async fn hcai_api_get(
    path: String,
    access_token: String,
    query: Option<Vec<(String, String)>>,
) -> Result<Value, String> {
    let q = query.as_deref();
    hcai_api_request("GET", &path, &access_token, q, None).await
}

/// 已登录 POST（JSON body）。
#[tauri::command(rename_all = "camelCase")]
pub async fn hcai_api_post(
    path: String,
    access_token: String,
    body: Option<Value>,
    query: Option<Vec<(String, String)>>,
) -> Result<Value, String> {
    let q = query.as_deref();
    hcai_api_request("POST", &path, &access_token, q, body.as_ref()).await
}

/// 已登录 PUT（JSON body）。
#[tauri::command(rename_all = "camelCase")]
pub async fn hcai_api_put(
    path: String,
    access_token: String,
    body: Option<Value>,
    query: Option<Vec<(String, String)>>,
) -> Result<Value, String> {
    let q = query.as_deref();
    hcai_api_request("PUT", &path, &access_token, q, body.as_ref()).await
}

/// 已登录 DELETE。
#[tauri::command(rename_all = "camelCase")]
pub async fn hcai_api_delete(
    path: String,
    access_token: String,
    query: Option<Vec<(String, String)>>,
) -> Result<Value, String> {
    let q = query.as_deref();
    hcai_api_request("DELETE", &path, &access_token, q, None).await
}

#[cfg(test)]
mod tests {
    use super::*;

    const REQUEST_ID: &str = "123e4567-e89b-42d3-a456-426614174000";

    #[test]
    fn desktop_redirect_uses_allowed_relative_callback() {
        assert_eq!(
            desktop_oauth_redirect(REQUEST_ID),
            format!("/auth/oauth/callback?client=ccswitch&request_id={REQUEST_ID}")
        );
    }

    #[test]
    fn parses_exact_hcai_oauth_deep_link() {
        let callback = format!(
            "ccswitch://hcai/oauth/callback?request_id={REQUEST_ID}#access_token=access%2Btoken&refresh_token=refresh-token&expires_in=3600&token_type=Bearer"
        );
        let (request_id, tokens) = parse_hcai_oauth_deep_link(&callback).unwrap();

        assert_eq!(request_id, REQUEST_ID);
        assert_eq!(tokens.access_token, "access+token");
        assert_eq!(tokens.refresh_token, "refresh-token");
        assert_eq!(tokens.expires_in, 3600);
        assert_eq!(tokens.token_type, "Bearer");
    }

    #[test]
    fn rejects_other_deep_links_and_invalid_request_ids() {
        assert!(parse_hcai_oauth_deep_link(
            "ccswitch://v1/import?request_id=123e4567-e89b-42d3-a456-426614174000#access_token=x"
        )
        .is_err());
        assert!(parse_hcai_oauth_deep_link(
            "ccswitch://hcai/oauth/callback?request_id=not-a-uuid#access_token=x"
        )
        .is_err());
    }

    #[test]
    fn pending_request_must_match_and_be_fresh() {
        let pending = HcaiOAuthPendingRequest {
            request_id: REQUEST_ID.to_string(),
            created_at: 1_000,
        };

        assert!(is_oauth_pending_valid(&pending, REQUEST_ID, 1_001));
        assert!(!is_oauth_pending_valid(&pending, REQUEST_ID, 999));
        assert!(!is_oauth_pending_valid(
            &pending,
            "b23e4567-e89b-42d3-a456-426614174000",
            1_001
        ));
        assert!(!is_oauth_pending_valid(
            &pending,
            REQUEST_ID,
            1_000 + OAUTH_PENDING_MAX_AGE_SECS + 1
        ));
    }
}
