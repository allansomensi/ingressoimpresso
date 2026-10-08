//! JSON request and response bodies. TypeScript types are generated from these structs into
//! `packages/api-types/src/generated/` (`cargo test -p ingressoimpresso-server --features ts`).
//!
//! Field names are `camelCase`, enum values `snake_case`, timestamps RFC 3339 strings.

use serde::{Deserialize, Serialize};
use ticket_render::TicketDesign;
use time::OffsetDateTime;
use uuid::Uuid;

macro_rules! dto {
    ($($item:item)*) => {
        $(
            #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
            #[serde(rename_all = "camelCase")]
            #[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export, export_to = "api-types/src/generated/"))]
            $item
        )*
    };
}

macro_rules! dto_enum {
    ($($item:item)*) => {
        $(
            #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
            #[serde(rename_all = "snake_case")]
            #[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export, export_to = "api-types/src/generated/"))]
            $item
        )*
    };
}

dto! {
    /// `POST /api/auth/code`.
    pub struct RequestCodeBody {
        /// E-mail that receives the code.
        pub email: String,
    }

    /// `POST /api/auth/verify`.
    pub struct VerifyCodeBody {
        /// Same e-mail as in the code request.
        pub email: String,
        /// The 6-digit code.
        pub code: String,
    }

    /// A new session.
    pub struct SessionResponse {
        /// Bearer token (ADR 0016). Shown once; the server keeps only its hash.
        pub token: String,
        /// The signed-in user.
        pub user: MeUser,
    }

    /// The signed-in user.
    pub struct MeUser {
        /// User id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// E-mail.
        pub email: String,
        /// May mark batches as paid (MVP, ADR 0014).
        pub is_admin: bool,
    }

    /// `POST /api/events` and `PUT /api/events/{id}`.
    pub struct EventBody {
        /// Event name (1–100 characters).
        pub name: String,
        /// Venue (optional, up to 120 characters).
        pub venue: Option<String>,
        /// Start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// End (after start).
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
        /// Ticket price in cents, for the seller settlement report.
        pub ticket_price_cents: Option<i32>,
    }

    /// An event.
    pub struct EventDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// Venue.
        pub venue: Option<String>,
        /// Start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// End.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
        /// Price in cents.
        pub ticket_price_cents: Option<i32>,
        /// Lifecycle.
        pub status: EventStatus,
    }

    /// Uploaded art.
    pub struct ArtDto {
        /// Blob id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// `image/png` or `image/jpeg`.
        pub content_type: String,
        /// Width in pixels.
        pub width_px: i32,
        /// Height in pixels.
        pub height_px: i32,
    }

    /// The current design of an event.
    pub struct DesignResponse {
        /// Version number; 0 means "not saved yet" (default design).
        pub version: i32,
        /// The design.
        pub design: TicketDesign,
        /// Art, if any.
        pub art: Option<ArtDto>,
    }

    /// `PUT /api/events/{id}/design` and `POST /api/events/{id}/design/preview`.
    pub struct DesignBody {
        /// The design.
        pub design: TicketDesign,
        /// Art uploaded to this event, if any.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub art_id: Option<Uuid>,
    }

    /// `POST /api/events/{id}/batches`.
    pub struct CreateBatchBody {
        /// How many tickets (1–5000), numbered after the last batch.
        pub quantity: i32,
    }

    /// A batch of ticket numbers.
    pub struct BatchDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// First number.
        pub first: i32,
        /// Last number (inclusive).
        pub last: i32,
        /// Payment status.
        pub status: BatchStatus,
        /// Creation time.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// Payment time.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub paid_at: Option<OffsetDateTime>,
    }

    /// `POST /api/events/{id}/sellers` and `PUT /api/sellers/{id}`.
    pub struct SellerBody {
        /// Name (1–60 characters, unique per event).
        pub name: String,
        /// Phone (optional).
        pub phone: Option<String>,
    }

    /// A seller with the ranges they hold.
    pub struct SellerDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// Phone.
        pub phone: Option<String>,
        /// Assigned ranges, ordered.
        pub ranges: Vec<RangeDto>,
    }

    /// An inclusive range of ticket numbers.
    pub struct RangeBody {
        /// First number.
        pub first: i32,
        /// Last number (inclusive).
        pub last: i32,
    }

    /// An assigned range.
    pub struct RangeDto {
        /// Assignment id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// First number.
        pub first: i32,
        /// Last number (inclusive).
        pub last: i32,
    }

    /// `POST /api/events/{id}/voids`.
    pub struct CreateVoidBody {
        /// First number.
        pub first: i32,
        /// Last number (inclusive).
        pub last: i32,
        /// Why.
        pub reason: VoidReason,
        /// Free note (up to 200 characters).
        pub note: Option<String>,
    }

    /// A voided range.
    pub struct VoidDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// First number.
        pub first: i32,
        /// Last number (inclusive).
        pub last: i32,
        /// Why.
        pub reason: VoidReason,
        /// Note.
        pub note: Option<String>,
        /// When.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// When it was undone, if it was.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub undone_at: Option<OffsetDateTime>,
    }

    /// `POST /api/events/{id}/exports`.
    pub struct CreateExportBody {
        /// File to generate.
        pub kind: ExportKind,
        /// Which tickets.
        pub scope: ExportScope,
        /// Print-shop file: draw crop marks (default true).
        pub crop_marks: Option<bool>,
    }

    /// An export (generated file).
    pub struct ExportDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// File type.
        pub kind: ExportKind,
        /// Which tickets.
        pub scope: ExportScope,
        /// Progress.
        pub status: ExportStatus,
        /// Tickets in the file (when done).
        pub ticket_count: Option<i32>,
        /// Suggested file name (when done).
        pub file_name: Option<String>,
        /// Size in bytes (when done).
        pub byte_size: Option<i64>,
        /// Error code (when failed).
        pub error: Option<String>,
        /// Requested at.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// A short-lived download link (ADR 0016).
    pub struct DownloadLinkDto {
        /// Absolute URL; works without authentication until `expiresAt`.
        pub url: String,
        /// Expiry.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub expires_at: OffsetDateTime,
    }
}

dto_enum! {
    /// Event lifecycle.
    pub enum EventStatus {
        /// Open.
        Active,
        /// Finished.
        Closed,
    }

    /// Batch payment status.
    pub enum BatchStatus {
        /// Waiting for payment (no ticket is signed).
        AwaitingPayment,
        /// Paid: tickets can be generated.
        Paid,
        /// Canceled before payment.
        Canceled,
    }

    /// Why a range was voided.
    pub enum VoidReason {
        /// Returned unsold.
        Unsold,
        /// Lost or stolen.
        Lost,
        /// Any other reason.
        Revoked,
    }

    /// Generated file type.
    pub enum ExportKind {
        /// A4 sheets for home printing.
        Home,
        /// Print-shop PDF with bleed.
        Print,
        /// Control sheet per seller.
        Control,
        /// WhatsApp images (ZIP).
        Whatsapp,
    }

    /// Export progress.
    pub enum ExportStatus {
        /// Waiting for the worker.
        Queued,
        /// Being generated.
        Running,
        /// Ready to download.
        Done,
        /// Failed (see `error`).
        Failed,
    }
}

/// Which tickets an export contains. Always only paid, non-voided tickets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub enum ExportScope {
    /// Every paid ticket of the event.
    All,
    /// One batch.
    Batch {
        /// Batch id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        batch_id: Uuid,
    },
    /// One seller's ranges.
    Seller {
        /// Seller id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        seller_id: Uuid,
    },
}

macro_rules! db_enum {
    ($ty:ty { $($variant:ident => $text:literal),* $(,)? }) => {
        impl $ty {
            /// Database value.
            pub const fn db(self) -> &'static str {
                match self { $(Self::$variant => $text),* }
            }

            /// Parses a database value.
            pub fn from_db(value: &str) -> Option<Self> {
                match value { $($text => Some(Self::$variant),)* _ => None }
            }
        }
    };
}

db_enum!(EventStatus { Active => "active", Closed => "closed" });
db_enum!(BatchStatus { AwaitingPayment => "awaiting_payment", Paid => "paid", Canceled => "canceled" });
db_enum!(VoidReason { Unsold => "unsold", Lost => "lost", Revoked => "revoked" });
db_enum!(ExportKind { Home => "home", Print => "print", Control => "control", Whatsapp => "whatsapp" });
db_enum!(ExportStatus { Queued => "queued", Running => "running", Done => "done", Failed => "failed" });
