//! Door API helpers: links, phones, manifests and scan uploads.

use axum::http::{Method, StatusCode};
use serde_json::{Value, json};

use super::TestApp;

/// Phone clock of the first scan in tests.
pub const AT: i64 = 1_795_000_000_000;

/// A phone registered through a fresh link.
pub struct Phone {
    pub id: String,
    pub secret: String,
}

pub async fn create_link(app: &TestApp, token: &str, event: &str) -> (String, String) {
    let reply = app
        .post(
            &format!("/api/events/{event}/door/accesses"),
            token,
            json!({ "label": "Equipe da porta" }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let body = reply.json();
    (
        body["access"]["id"].as_str().unwrap().to_owned(),
        body["token"].as_str().unwrap().to_owned(),
    )
}

pub async fn register(app: &TestApp, access_token: &str, name: &str) -> Phone {
    let reply = app
        .request(
            Method::POST,
            "/api/door/register",
            None,
            Some(json!({ "accessToken": access_token, "deviceName": name })),
        )
        .await;
    assert_eq!(
        reply.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&reply.bytes)
    );
    let body = reply.json();
    Phone {
        id: body["deviceId"].as_str().unwrap().to_owned(),
        secret: body["deviceSecret"].as_str().unwrap().to_owned(),
    }
}

pub async fn manifest(app: &TestApp, phone: &Phone, since: Option<&str>) -> Value {
    let uri = match since {
        Some(cursor) => format!("/api/door/manifest?since={cursor}"),
        None => "/api/door/manifest".to_owned(),
    };
    let reply = app.get(&uri, &phone.secret).await;
    assert_eq!(
        reply.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&reply.bytes)
    );
    reply.json()
}

pub fn scan(id: &str, number: Option<u32>, outcome: &str, offset_ms: i64) -> Value {
    json!({
        "id": id,
        "number": number,
        "keyId": number.map(|_| 1),
        "outcome": outcome,
        "scannedAtMs": AT + offset_ms,
    })
}

pub async fn upload(app: &TestApp, phone: &Phone, scans: Vec<Value>, confirm: bool) -> Value {
    let reply = app
        .post(
            "/api/door/scans",
            &phone.secret,
            json!({ "scans": scans, "confirm": confirm }),
        )
        .await;
    assert_eq!(
        reply.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&reply.bytes)
    );
    reply.json()
}

pub fn numbers(manifest: &Value) -> Vec<(u64, String)> {
    let mut entries: Vec<(u64, String)> = manifest["entries"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| {
            (
                entry["number"].as_u64().unwrap(),
                entry["deviceName"].as_str().unwrap().to_owned(),
            )
        })
        .collect();
    entries.sort();
    entries
}
