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
        /// Token of the anti-bot widget (ADR 0044); required when `captchaSiteKey` is set.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub captcha_token: Option<String>,
    }

    /// `POST /api/auth/verify`.
    pub struct VerifyCodeBody {
        /// Same e-mail as in the code request.
        pub email: String,
        /// The 6-digit code.
        pub code: String,
        /// Authenticator or recovery code, for accounts with two-step verification (ADR 0045).
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub two_factor_code: Option<String>,
        /// Code of the organization that referred a new account (ADR 0076); ignored for an
        /// existing one.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub referral_code: Option<String>,
    }

    /// A new session.
    pub struct SessionResponse {
        /// Bearer token (ADR 0016). Shown once; the server keeps only its hash.
        pub token: String,
        /// The signed-in user.
        pub user: MeUser,
        /// The account was just created through a referral link (ADR 0076).
        pub referred: bool,
    }

    /// The signed-in user.
    #[expect(
        clippy::struct_excessive_bools,
        reason = "flat flags are what the panel reads; they are not a state machine"
    )]
    pub struct MeUser {
        /// User id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// E-mail.
        pub email: String,
        /// Name shared by Google, if any.
        pub name: Option<String>,
        /// In `ADMIN_EMAILS` with two-step verification on: the admin panel and every
        /// organization (ADRs 0026, 0032, 0047).
        pub is_admin: bool,
        /// In `ADMIN_EMAILS` but without two-step verification: admin powers wait for it
        /// (ADR 0047).
        pub admin_pending_two_factor: bool,
        /// Signs in with Google too (ADR 0029).
        pub google: bool,
        /// The organization is suspended: the panel only reads (ADR 0032).
        pub suspended: bool,
    }

    /// `GET /api/auth/options`: how this server lets people sign in.
    pub struct AuthOptionsDto {
        /// OAuth client id of "Entrar com Google"; `null` when it is off.
        pub google_client_id: Option<String>,
        /// Cloudflare Turnstile site key (ADR 0044): when set, asking for a code needs the
        /// widget's token.
        pub captcha_site_key: Option<String>,
    }

    /// `POST /api/auth/google`.
    pub struct GoogleSignInBody {
        /// ID token (JWT) from Google Identity Services.
        pub credential: String,
        /// Authenticator or recovery code, for accounts with two-step verification (ADR 0045).
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub two_factor_code: Option<String>,
        /// Code of the organization that referred a new account (ADR 0076).
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub referral_code: Option<String>,
    }

    /// `GET /api/account/two-factor`: the account's two-step verification (ADR 0045).
    pub struct TwoFactorStatusDto {
        /// Whether sign-ins ask for a code of the authenticator app.
        pub enabled: bool,
        /// When it was turned on.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub enabled_at: Option<OffsetDateTime>,
        /// Unused recovery codes.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub recovery_codes_left: i64,
    }

    /// `POST /api/account/two-factor/setup`: a new secret to add to the authenticator app.
    pub struct TwoFactorSetupDto {
        /// The secret in base32, to type by hand.
        pub secret: String,
        /// `otpauth://` link, shown as a QR code.
        pub uri: String,
    }

    /// A code that confirms an action on two-step verification.
    pub struct TwoFactorCodeBody {
        /// Authenticator code (6 digits) or, to turn it off, a recovery code.
        pub code: String,
    }

    /// Recovery codes, shown once.
    pub struct RecoveryCodesDto {
        /// `ABCD-EFGH` codes, each good for one sign-in.
        pub codes: Vec<String>,
    }

    /// `DELETE /api/account`.
    pub struct DeleteAccountBody {
        /// The account's e-mail, typed as confirmation.
        pub email: String,
        /// Authenticator or recovery code, required when two-step verification is on (ADR 0045).
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub two_factor_code: Option<String>,
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
        /// Street address of the venue (optional, up to 200 characters, ADR 0066).
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional = nullable))]
        pub address: Option<String>,
        /// Tickets or consumption tokens (ADR 0084); missing: tickets on create, unchanged on
        /// update.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub kind: Option<EventKind>,
        /// The days of an event of several days (ADR 0091), in order: two or more set them (the
        /// event then starts with the first and ends with the last), an empty list makes it an
        /// event of one day again, missing leaves them as they are.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub days: Option<Vec<EventDayBody>>,
    }

    /// One day of an event of several days (ADR 0091).
    pub struct EventDayBody {
        /// When the day starts.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// When it ends (after the start, at most 48 hours later).
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
    }

    /// A day of an event of several days (ADR 0091), with the event's offset.
    pub struct EventDayDto {
        /// 1 for the first day.
        pub position: u8,
        /// Start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// End.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
    }

    /// `PUT /api/events/{id}/status`: archive (`closed`) or reopen (`active`).
    pub struct EventStatusBody {
        /// New lifecycle state.
        pub status: EventStatus,
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
        /// Opened by an admin outside their own organization (support mode, ADR 0032).
        pub support_access: bool,
        /// How the user is on the event's team (ADR 0055); `null` for the organization's own
        /// people, who may do everything.
        pub team: Option<EventTeamAccessDto>,
        /// Street address of the venue (ADR 0066).
        pub address: Option<String>,
        /// Name of the organization that runs it (`{organizacao}` on the ticket, ADR 0064).
        pub organization_name: String,
        /// Postponement and cancellation (ADR 0065).
        pub change: EventChangeDto,
        /// The series of dates it is one of (ADR 0077); `null` for an event with one date.
        pub series: Option<EventSeriesRefDto>,
        /// Required checklist items still missing (ADR 0078), in the event list only; `null`
        /// elsewhere and when the checklist does not apply (ended, archived or canceled).
        pub checklist_missing: Option<i32>,
        /// Tickets or consumption tokens (ADR 0084).
        pub kind: EventKind,
        /// The days of an event of several days (ADR 0091); empty for an event of one day.
        #[serde(default)]
        pub days: Vec<EventDayDto>,
    }

    /// The current user's place on the team of an event of another organization (ADR 0055).
    pub struct EventTeamAccessDto {
        /// What they take care of; `manage` means everything.
        pub areas: Vec<TeamArea>,
        /// The organization that owns the event.
        pub organization: String,
    }

    /// `GET /api/events/{id}/team`: who works on the event.
    pub struct EventTeamDto {
        /// The organization's own people (they may do everything, including deleting the event).
        pub owners: Vec<TeamOwnerDto>,
        /// People added to this event.
        pub members: Vec<TeamMemberDto>,
        /// Whether the current user may add, change and remove people.
        pub can_manage: bool,
    }

    /// A person of the organization that owns the event.
    pub struct TeamOwnerDto {
        /// E-mail.
        pub email: String,
        /// Name (from Google), if known.
        pub name: Option<String>,
        /// Whether it is the current user.
        pub you: bool,
    }

    /// A person added to an event's team.
    pub struct TeamMemberDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// E-mail.
        pub email: String,
        /// Name given by the team, or the account's name.
        pub name: Option<String>,
        /// What they take care of.
        pub areas: Vec<TeamArea>,
        /// Whether they have signed in since being added (`false`: the invite is waiting).
        pub joined: bool,
        /// Whether it is the current user.
        pub you: bool,
        /// When they were added.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// `POST /api/events/{id}/team`: adds a person by e-mail.
    pub struct TeamMemberBody {
        /// E-mail.
        pub email: String,
        /// How the team calls them (optional).
        pub name: Option<String>,
        /// What they take care of (at least one).
        pub areas: Vec<TeamArea>,
    }

    /// `PUT /api/team-members/{id}`: changes the name or the areas.
    pub struct TeamMemberUpdateBody {
        /// How the team calls them (optional).
        pub name: Option<String>,
        /// What they take care of (at least one).
        pub areas: Vec<TeamArea>,
    }

    /// `POST /api/events/{id}/team`: the person added and whether the e-mail went out.
    pub struct TeamMemberAdded {
        /// The person.
        pub member: TeamMemberDto,
        /// Whether the invite e-mail was sent (the daily quota may be spent).
        pub emailed: bool,
        /// Where to sign in, for sending the invite another way (WhatsApp).
        pub sign_in_url: String,
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
        /// Moderation (ADR 0042): `unchecked`, `clean`, `flagged` (printing waits for the
        /// team), `approved` or `rejected` (never printed).
        pub moderation: String,
    }

    /// The current design of an event.
    pub struct DesignResponse {
        /// Version number; 0 means "not saved yet" (default design).
        pub version: i32,
        /// The design.
        pub design: TicketDesign,
        /// Art, if any.
        pub art: Option<ArtDto>,
        /// Sponsors' logos, in order (ADR 0059).
        pub sponsors: Vec<ArtDto>,
    }

    /// `PUT /api/events/{id}/design` and `POST /api/events/{id}/design/preview`.
    pub struct DesignBody {
        /// The design.
        pub design: TicketDesign,
        /// Art uploaded to this event, if any.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub art_id: Option<Uuid>,
        /// Sponsors' logos uploaded to this event, in order (up to 6, ADR 0059).
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(type = "Array<string>", optional))]
        pub sponsor_ids: Vec<Uuid>,
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
        /// What the batch costs, in centavos (ADR 0020), after its free tickets.
        pub price_cents: i32,
        /// Tickets of the batch that came from the organization's free allowance (ADR 0024).
        pub free_tickets: i32,
        /// Price of the table before discounts and credit (ADR 0039); `null` for older batches.
        pub list_price_cents: Option<i32>,
        /// Discount of a promotion or code, in centavos.
        pub discount_cents: i32,
        /// Credit of the organization used, in centavos (ADR 0040).
        pub credit_cents: i32,
        /// How it was paid.
        pub paid_via: Option<PaymentMethod>,
        /// When an admin refunded it (its numbers are voided for good).
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub refunded_at: Option<OffsetDateTime>,
        /// An unsettled online payment: a checkout page is open, or a Pix transfer is being
        /// confirmed. `null` when there is none.
        pub pending_payment: Option<PaymentState>,
    }

    /// One price tier: tickets up to `upTo` (counted within the batch) cost `unitCents` each.
    pub struct PriceTierDto {
        /// Last ticket of the tier.
        pub up_to: i32,
        /// Price per ticket, in centavos.
        pub unit_cents: i32,
    }

    /// `GET /api/pricing`: graduated price table of batches.
    pub struct PricingDto {
        /// Lowercase ISO 4217 currency (`brl`).
        pub currency: String,
        /// Smallest charge, in centavos.
        pub minimum_cents: i32,
        /// Tiers in increasing order.
        pub tiers: Vec<PriceTierDto>,
        /// Whether batches can be paid online (Stripe configured).
        pub online_payment: bool,
        /// Free tickets every organization gets (taken off its first batches).
        pub free_tickets: i32,
        /// Promotion running now (ADR 0039).
        pub promotion: Option<ActivePromotionDto>,
        /// Announced table that starts later.
        pub upcoming: Option<UpcomingPricesDto>,
    }

    /// A price table announced for later (ADR 0039).
    pub struct UpcomingPricesDto {
        /// When it starts.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub effective_at: OffsetDateTime,
        /// Smallest charge.
        pub minimum_cents: i32,
        /// Tiers.
        pub tiers: Vec<PriceTierDto>,
        /// Free tickets of every organization.
        pub free_tickets: i32,
    }

    /// `GET /api/account`: the signed-in user's organization.
    pub struct AccountDto {
        /// Organization name.
        pub organization_name: String,
        /// Free tickets still available to the organization.
        pub free_tickets_left: i32,
        /// Free tickets of the organization: everyone's allowance plus any bonus from an admin.
        pub free_tickets_total: i32,
        /// Credit of the organization, in centavos (ADR 0040).
        pub credit_cents: i32,
        /// Events of the organization.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub event_count: i64,
        /// Paid tickets issued by the organization.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
        /// Why an admin suspended the organization, if it is suspended.
        pub suspended_reason: Option<String>,
        /// When the account accepted the current terms.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub terms_accepted_at: Option<OffsetDateTime>,
    }

    /// `PUT /api/account`.
    pub struct AccountBody {
        /// New organization name (1–100 characters).
        pub organization_name: String,
    }

    /// `GET /api/admin/overview`: totals of the whole service (admins only, ADR 0026).
    pub struct AdminOverviewDto {
        /// Organizations.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub organizations: i64,
        /// Organizations created in the last 30 days.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub new_organizations: i64,
        /// Accounts that signed in during the last 30 days (each organization has one account, so
        /// a total would repeat `organizations`).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub active_accounts: i64,
        /// Events.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub events: i64,
        /// Events that have not ended yet.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub upcoming_events: i64,
        /// Tickets of paid batches (free ones included).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
        /// Tickets given from free allowances.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub free_tickets: i64,
        /// Money received, in centavos: Stripe payments and batches paid another way, refunded
        /// ones included.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub gross_cents: i64,
        /// Money given back (Stripe refunds, partial ones included, and admin refunds).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub refunds_cents: i64,
        /// `gross_cents - refunds_cents`.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub net_cents: i64,
        /// Money received in the last 30 days.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub gross_30d_cents: i64,
        /// Money given back in the last 30 days.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub refunds_30d_cents: i64,
        /// `gross_30d_cents - refunds_30d_cents`.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub net_30d_cents: i64,
        /// Batches waiting for payment.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub awaiting_batches: i64,
        /// Pix generated and not yet confirmed.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub processing_payments: i64,
        /// The last 30 days, oldest first (Brasília dates).
        pub days: Vec<AdminDayDto>,
    }

    /// One day of the admin overview.
    pub struct AdminDayDto {
        /// `YYYY-MM-DD`.
        pub date: String,
        /// Tickets of batches paid that day.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub tickets: i64,
        /// Money received that day (before refunds), in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revenue_cents: i64,
        /// Organizations created that day.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub signups: i64,
    }

    /// An organization as admins see it.
    pub struct AdminOrganizationDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// E-mail of the first owner.
        pub owner_email: Option<String>,
        /// Creation time.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// Events.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub event_count: i64,
        /// Tickets of paid batches.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
        /// Money of paid batches, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revenue_cents: i64,
        /// Free tickets used.
        pub free_used: i32,
        /// Free tickets granted: everyone's allowance plus the bonus.
        pub free_total: i32,
        /// Extra free tickets given by an admin.
        pub bonus_free_tickets: i32,
        /// Last batch created.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub last_batch_at: Option<OffsetDateTime>,
        /// Suspended by an admin.
        pub suspended: bool,
    }

    /// `GET /api/admin/organizations/{id}`: one account for support.
    pub struct AdminOrganizationDetailDto {
        /// Usage summary.
        pub organization: AdminOrganizationDto,
        /// When it was suspended, if it is.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub suspended_at: Option<OffsetDateTime>,
        /// Why.
        pub suspended_reason: Option<String>,
        /// People of the organization.
        pub members: Vec<AdminMemberDto>,
        /// Events, newest first.
        pub events: Vec<AdminEventDto>,
        /// Latest admin actions on this organization.
        pub audit: Vec<AuditEntryDto>,
    }

    /// A member of an organization, as admins see it.
    pub struct AdminMemberDto {
        /// User id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub user_id: Uuid,
        /// E-mail.
        pub email: String,
        /// Name shared by Google.
        pub name: Option<String>,
        /// `owner` or `member`.
        pub role: String,
        /// Account created at.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// Last sign-in.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub last_login_at: Option<OffsetDateTime>,
        /// Signs in with Google.
        pub google: bool,
        /// Has two-step verification on (ADR 0045).
        pub two_factor: bool,
        /// Open sessions.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sessions: i64,
    }

    /// An event in the admin view of an organization.
    pub struct AdminEventDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// Start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// `active` or `closed`.
        pub status: String,
        /// Tickets of paid batches.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
        /// Money of paid batches, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revenue_cents: i64,
        /// Tickets that entered.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
    }

    /// An event of any organization found by the admin search (ADR 0079).
    pub struct AdminEventSearchDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// Start, in the event's local time.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// `active` or `closed`.
        pub status: String,
        /// Canceled by the organization (ADR 0065).
        pub canceled: bool,
        /// Its organization.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub organization_id: Uuid,
        /// The organization's name.
        pub organization_name: String,
        /// Tickets of paid batches.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
    }

    /// One line of the audit log (ADR 0032).
    pub struct AuditEntryDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Admin who acted.
        pub actor_email: String,
        /// What, e.g. `batch_refund` or `support_write`.
        pub action: String,
        /// Organization concerned.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub organization_id: Option<Uuid>,
        /// Its name.
        pub organization_name: Option<String>,
        /// Event concerned.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub event_id: Option<Uuid>,
        /// Its name.
        pub event_name: Option<String>,
        /// Batch, user or note concerned.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub target_id: Option<Uuid>,
        /// Details (amounts, the request path...).
        #[cfg_attr(feature = "ts", ts(type = "Record<string, unknown>"))]
        pub detail: serde_json::Value,
        /// When.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// `PUT /api/admin/organizations/{id}/suspension`.
    pub struct AdminSuspensionBody {
        /// Suspend (`true`) or lift (`false`).
        pub suspended: bool,
        /// Why (shown to the organization, up to 200 characters).
        pub reason: Option<String>,
    }

    /// `PUT /api/admin/organizations/{id}`.
    pub struct AdminRenameBody {
        /// New name (1–100 characters).
        pub name: String,
    }

    /// `POST /api/admin/batches/{id}/refund`.
    pub struct AdminRefundBody {
        /// Refund the payment on Stripe too (batches paid online); otherwise only record it.
        pub refund_on_stripe: bool,
        /// Note for the log (up to 200 characters).
        pub note: Option<String>,
    }

    /// `POST /api/admin/payments/sync-refunds`: refunds read back from Stripe.
    pub struct RefundSyncDto {
        /// Payments read back in this round.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub checked: i64,
        /// Payments with more refunded than recorded.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub updated: i64,
        /// Batches refunded in full, whose tickets are now blocked.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub refunded_batches: i64,
        /// Payments still to read (another round).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub remaining: i64,
    }

    /// `PUT /api/admin/batches/{id}/price`.
    pub struct AdminBatchPriceBody {
        /// New price in centavos; 0 frees the batch.
        pub price_cents: i32,
    }

    /// `GET /api/admin/finance?days=`: the service's revenue (ADR 0034).
    pub struct AdminFinanceDto {
        /// Length of the period.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub days: i64,
        /// Batches paid in the period, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revenue_cents: i64,
        /// Same, in the period before.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub previous_revenue_cents: i64,
        /// Refunded in the period.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub refunds_cents: i64,
        /// Batches refunded in the period.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub refunded_batches: i64,
        /// Revenue minus refunds.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub net_cents: i64,
        /// Batches that cost money, paid in the period.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub charged_batches: i64,
        /// Tickets charged (free ones excluded).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub charged_tickets: i64,
        /// Revenue per charged batch.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub average_batch_cents: i64,
        /// Batches waiting for payment now.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub pending_batches: i64,
        /// Their value.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub pending_cents: i64,
        /// Batches of the period by how they were paid.
        pub methods: Vec<AdminMethodDto>,
        /// Whether `series` is by month (a year) or by day.
        pub monthly: bool,
        /// Revenue over the period, oldest first.
        pub series: Vec<AdminSeriesPointDto>,
        /// Organizations that paid the most in the period.
        pub top_organizations: Vec<AdminTopOrganizationDto>,
        /// Organizations created in the period...
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub signups: i64,
        /// ...that created an event...
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub signups_with_event: i64,
        /// ...that got tickets (free ones count)...
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub signups_with_tickets: i64,
        /// ...and that paid for a batch.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub signups_paying: i64,
    }

    /// Batches of a payment method.
    pub struct AdminMethodDto {
        /// How they were paid.
        pub method: PaymentMethod,
        /// Batches.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub batches: i64,
        /// Tickets.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub tickets: i64,
        /// Money, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revenue_cents: i64,
    }

    /// One day or month of the finance chart.
    pub struct AdminSeriesPointDto {
        /// `YYYY-MM-DD` or `YYYY-MM` (Brasília).
        pub label: String,
        /// Money of batches paid, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revenue_cents: i64,
        /// Tickets of batches paid.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub tickets: i64,
        /// Batches paid.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub batches: i64,
    }

    /// An organization among those that paid the most.
    pub struct AdminTopOrganizationDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// Money paid in the period, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revenue_cents: i64,
        /// Tickets bought in the period.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub tickets: i64,
    }

    /// A changelog note (ADR 0031).
    pub struct ChangelogEntryDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// New, improvement, fix or security.
        pub kind: ChangelogKind,
        /// Title.
        pub title: String,
        /// Text (paragraphs separated by blank lines).
        pub body: String,
        /// Release that brought the change (`1.4.0`, ADR 0049); `null` outside any release.
        pub version: Option<String>,
        /// Publication time; `null` for a draft.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub published_at: Option<OffsetDateTime>,
        /// Created at.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// Last edit.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub updated_at: OffsetDateTime,
    }

    /// `POST /api/admin/changelog` and `PUT /api/admin/changelog/{id}`.
    pub struct ChangelogBody {
        /// New, improvement, fix or security.
        pub kind: ChangelogKind,
        /// Title (1–120 characters).
        pub title: String,
        /// Text (up to 4000 characters).
        pub body: String,
        /// Release that brought the change (`1.4.0`, ADR 0049); empty or absent: none.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub version: Option<String>,
        /// Published (`false`: draft).
        pub published: bool,
    }

    /// `PUT /api/admin/organizations/{id}/bonus`.
    pub struct AdminBonusBody {
        /// Extra free tickets (0–100000), replacing the current bonus.
        pub bonus_free_tickets: i32,
    }

    /// A batch of any organization, as admins see it.
    pub struct AdminBatchDto {
        /// The batch.
        pub batch: BatchDto,
        /// Event id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub event_id: Uuid,
        /// Event name.
        pub event_name: String,
        /// Organization name.
        pub organization_name: String,
        /// E-mail of the organization's first owner.
        pub owner_email: Option<String>,
    }

    /// `POST /api/events/{id}/tickets`: a digital ticket link (ADR 0030).
    pub struct CreateTicketLinkBody {
        /// Ticket number; `null` takes the next free paid number.
        pub number: Option<i32>,
        /// Who receives it (optional, up to 80 characters).
        pub holder_name: Option<String>,
    }

    /// `POST /api/events/{id}/tickets/bulk`: links for a range (up to 500 numbers).
    pub struct CreateTicketLinksBody {
        /// First number.
        pub first: i32,
        /// Last number (inclusive).
        pub last: i32,
    }

    /// `PUT /api/ticket-links/{id}`.
    pub struct UpdateTicketLinkBody {
        /// Who receives it; `null` clears it.
        pub holder_name: Option<String>,
    }

    /// A digital ticket link, as the organizer sees it.
    pub struct TicketLinkDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Ticket number.
        pub number: i32,
        /// Number as printed (zero padded).
        pub number_label: String,
        /// Who receives it.
        pub holder_name: Option<String>,
        /// The link to send (`/ingresso#<token>`).
        pub url: String,
        /// Created at.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// When it was revoked, if it was.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub revoked_at: Option<OffsetDateTime>,
        /// First time the holder opened it.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub first_opened_at: Option<OffsetDateTime>,
        /// Last time it was opened.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub last_opened_at: Option<OffsetDateTime>,
        /// How many times it was opened.
        pub open_count: i32,
        /// Valid, voided or already used at the door.
        pub state: TicketState,
        /// When the ticket entered.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub entered_at: Option<OffsetDateTime>,
        /// The seller who sent it from their link (ADR 0061); `null` when sent from the panel.
        pub seller: Option<String>,
    }

    /// `GET /api/events/{id}/tickets`.
    pub struct TicketLinksDto {
        /// Every link, active first.
        pub links: Vec<TicketLinkDto>,
        /// Smallest paid number with no seller, void, link or entry.
        pub next_number: Option<i32>,
        /// Paid tickets of the event.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
        /// Digits of printed numbers.
        pub number_digits: u8,
    }

    /// `POST /api/ticket` and `POST /api/ticket/image` (no login).
    pub struct OpenTicketBody {
        /// Token from the link's fragment.
        pub token: String,
    }

    /// What the holder's phone shows.
    pub struct TicketPassDto {
        /// The event.
        pub event: TicketPassEvent,
        /// Ticket number.
        pub number: i32,
        /// Number as printed.
        pub number_label: String,
        /// Text before the number on paper, e.g. "Nº ".
        pub number_prefix: String,
        /// Who it was sent to.
        pub holder_name: Option<String>,
        /// The signed QR text; `null` when the ticket is voided.
        pub qr_text: Option<String>,
        /// Valid, voided or used.
        pub state: TicketState,
        /// When it entered.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub entered_at: Option<OffsetDateTime>,
        /// Background colour of the ticket design (`#rrggbb`).
        pub background_color: String,
        /// Category (ADR 0056): name and colour.
        pub category: Option<DoorCategoryTagDto>,
        /// Table and seat (ADR 0057), e.g. `Mesa 5 · Lugar 3`.
        pub seat: Option<String>,
        /// Who runs the event: name, logo and contact (ADR 0064).
        pub organization: PublicOrganizationDto,
        /// The room with the holder's table highlighted (ADR 0066); `null` without a seat.
        pub table_map: Option<PassTableMapDto>,
        /// How to pay for it by Pix (ADR 0085); `null` when the event does not charge by Pix or
        /// the number has nothing to pay.
        #[serde(default)]
        pub pix: Option<TicketPixDto>,
    }

    /// The Pix of a digital ticket.
    pub struct TicketPixDto {
        /// The key, the receiver and the city.
        pub account: PixAccountDto,
        /// The number's price (its category's, else the event's); `null`: the payer types it.
        pub amount_cents: Option<i32>,
        /// Someone saw the money arrive.
        pub paid: bool,
    }

    /// A category's name and colour.
    pub struct DoorCategoryTagDto {
        /// Name.
        pub name: String,
        /// Band colour (`#rrggbb`).
        pub color: String,
        /// The door asks for a document (ADR 0082): the holder is told to bring it.
        #[serde(default)]
        pub check_document: bool,
        /// Which documents count.
        #[serde(default)]
        pub document_note: Option<String>,
        /// On which days of an event of several days it is valid (ADR 0091).
        #[serde(default)]
        pub day_rule: DayRule,
        /// The days of `days` (1 for the first).
        #[serde(default)]
        pub valid_days: Vec<u8>,
    }

    /// The event on a digital ticket.
    pub struct TicketPassEvent {
        /// Name.
        pub name: String,
        /// Venue.
        pub venue: Option<String>,
        /// Start, with the event's offset.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// End.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
        /// Organization name.
        pub organizer: String,
        /// Event id: the stable `UID` of the calendar entry (ADR 0066).
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Street address of the venue.
        pub address: Option<String>,
        /// Postponement and cancellation, as the panel shows them (ADR 0065).
        pub change: EventChangeDto,
        /// One of several dates (ADR 0077): the ticket says which session it is for.
        #[serde(default)]
        pub in_series: bool,
        /// Tickets or consumption tokens (ADR 0084).
        #[serde(default)]
        pub kind: EventKind,
        /// The days of an event of several days (ADR 0091).
        #[serde(default)]
        pub days: Vec<EventDayDto>,
    }

    /// `GET /api/analytics`: results of every event of the organization (ADR 0034).
    pub struct OrgAnalyticsDto {
        /// Sums.
        pub totals: ResultTotalsDto,
        /// One line per event, newest first.
        pub events: Vec<EventResultDto>,
        /// The last twelve months by event start, oldest first.
        pub months: Vec<MonthResultDto>,
    }

    /// Sums of the organization.
    #[derive(Default)]
    pub struct ResultTotalsDto {
        /// Events.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub events: i64,
        /// Paid tickets.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
        /// Declared sold.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sold: i64,
        /// Entries.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
        /// Sold × price, in centavos (events with a price).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub gross_cents: i64,
        /// Paid for batches, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub cost_cents: i64,
        /// Gross minus cost.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub net_cents: i64,
    }

    /// One event's results.
    pub struct EventResultDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// Start, with the event's offset.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// `active` or `closed`.
        pub status: String,
        /// Ticket price.
        pub ticket_price_cents: Option<i32>,
        /// Paid tickets.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
        /// Declared sold.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sold: i64,
        /// Entries.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
        /// Sold × price.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub gross_cents: i64,
        /// Paid for batches.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub cost_cents: i64,
    }

    /// One month of the organization's results.
    #[derive(Default)]
    pub struct MonthResultDto {
        /// `YYYY-MM`.
        pub month: String,
        /// Events starting that month.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub events: i64,
        /// Declared sold.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sold: i64,
        /// Entries.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
        /// Sold × price.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub gross_cents: i64,
        /// Paid for batches.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub cost_cents: i64,
    }

    /// `GET /api/events/{id}/analytics`.
    pub struct EventAnalyticsDto {
        /// Ticket price.
        pub ticket_price_cents: Option<i32>,
        /// Paid tickets.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
        /// Declared sold: paid − unsold − lost.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sold: i64,
        /// Voided as unsold.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub unsold: i64,
        /// Voided as lost.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub lost: i64,
        /// Voided for another reason.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revoked: i64,
        /// Tickets that entered.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
        /// Copies stopped at the door.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub blocked_copies: i64,
        /// Sold × price, when the event has a price.
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub gross_cents: Option<i64>,
        /// Paid for the batches.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub cost_cents: i64,
        /// Gross minus cost.
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub net_cents: Option<i64>,
        /// Tickets that came free.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub free_tickets: i64,
        /// Active digital links.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub digital_tickets: i64,
        /// Of those, opened at least once.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub digital_opened: i64,
        /// First entry.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub first_entry_at: Option<OffsetDateTime>,
        /// Last entry.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub last_entry_at: Option<OffsetDateTime>,
        /// Entries per 15 minutes.
        pub timeline: Vec<EntryBucketDto>,
    }

    /// Entries in a 15-minute bar.
    pub struct EntryBucketDto {
        /// Start of the bar, with the event's offset.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub at: OffsetDateTime,
        /// First entries in it.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
    }

    /// `POST /api/batches/{id}/checkout`: the Stripe payment page.
    pub struct CheckoutDto {
        /// Where to send the browser.
        pub url: String,
    }

    /// `POST /api/events/{id}/sellers` and `PUT /api/sellers/{id}`.
    pub struct SellerBody {
        /// Name (1–60 characters, unique per event).
        pub name: String,
        /// Phone (optional).
        pub phone: Option<String>,
        /// Box office (ADR 0069); missing keeps the current choice (no on a new seller).
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub box_office: Option<bool>,
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
        /// The seller's active private link (ADR 0053), if any.
        pub link: Option<SellerLinkDto>,
        /// Sells at the door (ADR 0069): sold = numbers that entered.
        pub box_office: bool,
        /// Tickets the seller aims to sell (ADR 0073); never on a box office.
        pub goal: Option<i32>,
        /// The seller's own Pix key (ADR 0085), when buyers pay them directly.
        pub pix: Option<PixAccountDto>,
    }

    /// A seller's private link, where they mark what they sold (ADR 0053).
    pub struct SellerLinkDto {
        /// The address to send the seller (the token is in the fragment).
        pub url: String,
        /// When it was created.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// When the seller last opened it.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub last_opened_at: Option<OffsetDateTime>,
    }

    /// A ticket its seller marked as sold.
    pub struct TicketSaleDto {
        /// Ticket number.
        pub number: i32,
        /// Seller.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub seller_id: Uuid,
        /// Buyer's name, if written down.
        pub buyer_name: Option<String>,
        /// Buyer's phone, if written down.
        pub buyer_phone: Option<String>,
        /// When it was marked.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub sold_at: OffsetDateTime,
    }

    /// `POST /api/seller`: the token of a seller's link, in the body so it stays out of logs.
    pub struct SellerTokenBody {
        /// The token from the link's fragment.
        pub token: String,
    }

    /// `POST /api/seller/sales`: numbers the seller sold, all to one buyer (optional).
    pub struct SellerMarkBody {
        /// The token from the link's fragment.
        pub token: String,
        /// The numbers, as inclusive ranges (1 to 100 ranges, up to 1,000 numbers).
        pub ranges: Vec<RangeBody>,
        /// Buyer's name (up to 80 characters, one line).
        pub buyer_name: Option<String>,
        /// Buyer's phone (up to 30 characters, one line).
        pub buyer_phone: Option<String>,
    }

    /// `POST /api/seller/tickets`: the seller sends the digital ticket of a number they sold
    /// (ADR 0061).
    pub struct SellerTicketBody {
        /// The token from the link's fragment.
        pub token: String,
        /// The number, already marked as sold by this seller.
        pub number: i32,
    }

    /// `GET /api/events/{id}/seller-settings`: what sellers may do and see on their links.
    pub struct SellerSettingsDto {
        /// Sellers may send the digital ticket of what they sold (ADR 0061).
        pub send_tickets: bool,
        /// Sellers see their position and the top 5 (ADR 0073).
        pub ranking: bool,
    }

    /// `PUT /api/events/{id}/seller-settings`: a missing field keeps its value.
    pub struct SellerSettingsBody {
        /// Sellers may send digital tickets.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub send_tickets: Option<bool>,
        /// Sellers see the ranking.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub ranking: Option<bool>,
    }

    /// `PUT /api/sellers/{id}/goal`.
    pub struct SellerGoalBody {
        /// Tickets to sell (1–100,000); `null` removes the goal.
        pub goal: Option<i32>,
    }

    /// `POST /api/events/{id}/sellers/goals`: one goal for every seller (box offices aside).
    pub struct SellerGoalsBody {
        /// Tickets to sell (1–100,000); `null` removes every goal.
        pub goal: Option<i32>,
        /// Only sellers without a goal yet.
        pub only_missing: bool,
    }

    /// How many sellers got the goal.
    pub struct SellerGoalsDto {
        /// Sellers changed.
        pub updated: i32,
    }

    /// A reservation (ADR 0072): numbers a seller holds for a person until a deadline. The
    /// seller's word, not a payment: it never reaches the door.
    pub struct ReservationDto {
        /// Id, shared by the numbers reserved together.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// The seller.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub seller_id: Uuid,
        /// Numbers still reserved (sold, returned or moved numbers leave the reservation).
        pub numbers: Vec<NumberRangeDto>,
        /// For whom.
        pub holder_name: String,
        /// Their phone, for the reminder.
        pub holder_phone: Option<String>,
        /// Until when, in the event's offset.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub expires_at: OffsetDateTime,
        /// When it was made.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// Still holds its numbers (the deadline has not passed).
        pub active: bool,
        /// Made by the organizer on the panel.
        pub by_organizer: bool,
    }

    /// `POST /api/sellers/{id}/reservations`.
    pub struct ReservationBody {
        /// The numbers (1 to 100 ranges, up to 1,000 numbers), all the seller's.
        pub ranges: Vec<RangeBody>,
        /// For whom (1–80 characters, one line).
        pub holder_name: String,
        /// Their phone (up to 30 characters).
        pub holder_phone: Option<String>,
        /// Until when: in the future, before the event ends.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub expires_at: OffsetDateTime,
    }

    /// The seller's position among the event's sellers (ADR 0073), when the organizer shows it.
    pub struct SellerRankingDto {
        /// The seller's position (ties share it); `null` before their first sale.
        pub position: Option<i32>,
        /// Sellers in the ranking (box offices and sellers without numbers aside).
        pub participants: i32,
        /// The first ones with at least one sale (up to 5).
        pub top: Vec<SellerRankingEntryDto>,
    }

    /// One line of the ranking: only the first name and an initial of the others.
    pub struct SellerRankingEntryDto {
        /// Position (ties share it).
        pub position: i32,
        /// "Ana S.".
        pub name: String,
        /// Sales marked.
        pub sold: i32,
        /// The seller who is looking.
        pub you: bool,
    }

    /// `POST /api/seller/sync`: changes made on the seller's page, in order (ADR 0074).
    pub struct SellerSyncBody {
        /// The token from the link's fragment.
        pub token: String,
        /// Up to 50 changes; each id is created on the phone, so a repeated one changes nothing.
        pub ops: Vec<SellerOpItem>,
    }

    /// One change of the seller's page.
    pub struct SellerOpItem {
        /// Id created on the phone.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// What it does.
        pub op: SellerOp,
    }

    /// The answer of `POST /api/seller/sync`: the page after the changes and what became of each.
    pub struct SellerSyncDto {
        /// The page, fresh.
        pub view: SellerViewDto,
        /// One result per change, in order.
        pub results: Vec<SellerOpResultDto>,
    }

    /// What became of one change; the same answer every time the id is sent.
    pub struct SellerOpResultDto {
        /// The change.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Done, partly done or not done.
        pub outcome: SellerOpOutcome,
        /// Why numbers were left out.
        pub problems: Vec<SellerOpProblemDto>,
    }

    /// Numbers a change left out, and why.
    pub struct SellerOpProblemDto {
        /// Why.
        pub reason: SellerOpProblem,
        /// Which numbers (empty when it is about the whole change).
        pub numbers: Vec<NumberRangeDto>,
        /// The buyer or the person the numbers are reserved for, when it helps to explain.
        pub holder: Option<String>,
    }

    /// `POST /api/events/{id}/tickets/replace`: the replacement of a lost ticket (ADR 0061).
    pub struct ReplaceTicketBody {
        /// The lost number: it is voided.
        pub number: i32,
        /// The number to send instead; `null` takes the next free one of the same category.
        pub new_number: Option<i32>,
        /// Who receives it (optional, up to 80 characters); `null` keeps the lost ticket's holder.
        pub holder_name: Option<String>,
        /// Why (optional, up to 200 characters), kept in the void.
        pub note: Option<String>,
    }

    /// A replacement made: the voided number and the digital ticket sent instead.
    pub struct TicketReplacementDto {
        /// The lost number, now voided.
        pub old_number: i32,
        /// The lost number as printed.
        pub old_label: String,
        /// The digital ticket of the new number.
        pub link: TicketLinkDto,
    }

    /// `POST /api/seller/sales/undo`: a number marked by mistake.
    pub struct SellerUnmarkBody {
        /// The token from the link's fragment.
        pub token: String,
        /// The number.
        pub number: i32,
    }

    /// An inclusive range of ticket numbers, as the API shows it.
    pub struct NumberRangeDto {
        /// First number.
        pub first: i32,
        /// Last number (inclusive).
        pub last: i32,
    }

    /// Numbers of the seller that no longer count (returned, lost or voided).
    pub struct SellerVoidDto {
        /// First number.
        pub first: i32,
        /// Last number (inclusive).
        pub last: i32,
        /// Why.
        pub reason: VoidReason,
    }

    /// A ticket the seller marked as sold, on their page.
    pub struct SellerSaleDto {
        /// Ticket number.
        pub number: i32,
        /// Buyer's name.
        pub buyer_name: Option<String>,
        /// Buyer's phone.
        pub buyer_phone: Option<String>,
        /// When it was marked.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub sold_at: OffsetDateTime,
        /// The number's active digital ticket, if one was sent (ADR 0061).
        pub ticket_url: Option<String>,
        /// Its Pix was seen arriving (ADR 0085).
        #[serde(default)]
        pub pix_receipt: Option<PixReceiptDto>,
    }

    /// Money the organizer recorded from this seller, on their page.
    pub struct SellerViewPaymentDto {
        /// Amount in cents.
        pub amount_cents: i32,
        /// How it was paid.
        pub method: SellerPaymentMethod,
        /// Day it was received, `YYYY-MM-DD`.
        pub received_on: String,
    }

    /// Where the seller stands, as on the organizer's settlement.
    pub struct SellerSummaryDto {
        /// Paid tickets the seller holds.
        pub tickets: i32,
        /// Marked as sold (and not voided).
        pub sold: i32,
        /// Still with the seller: not sold, not reserved and not voided.
        pub available: i32,
        /// Reserved for someone (ADR 0072), not sold yet.
        pub reserved: i32,
        /// Returned unsold.
        pub unsold: i32,
        /// Lost.
        pub lost: i32,
        /// What the seller answers for: tickets − unsold − lost.
        pub due_tickets: i32,
        /// `due_tickets` × price (each category's price, else the event's), when all have one.
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub amount_due_cents: Option<i64>,
        /// The tickets due by category (one line without categories).
        pub due_lines: Vec<SellerDueLineDto>,
        /// Money the organizer recorded, Pix paid straight to the organization included.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub received_cents: i64,
        /// Of `received_cents`, the buyers' Pix the organization received for the seller's
        /// numbers (ADR 0085).
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub pix_cents: i64,
        /// Amount due − received, when the event has a price.
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub balance_cents: Option<i64>,
    }

    /// Tickets a seller answers for at one price.
    pub struct SellerDueLineDto {
        /// Category name; `null` without a category.
        pub category: Option<String>,
        /// Band colour.
        pub color: Option<String>,
        /// Tickets.
        pub tickets: i32,
        /// Price of each.
        pub price_cents: Option<i32>,
    }

    /// A category on the seller's page: which numbers it covers.
    pub struct SellerCategoryDto {
        /// Name.
        pub name: String,
        /// Band colour.
        pub color: String,
        /// Price (the category's, else the event's).
        pub price_cents: Option<i32>,
        /// Numbers of the category.
        pub ranges: Vec<NumberRangeDto>,
    }

    /// The event, on the seller's page.
    pub struct SellerViewEvent {
        /// Name.
        pub name: String,
        /// Venue.
        pub venue: Option<String>,
        /// Start, in the event's own offset.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// Organization name.
        pub organizer: String,
        /// Ticket price in cents.
        pub ticket_price_cents: Option<i32>,
        /// Street address of the venue (ADR 0066).
        pub address: Option<String>,
        /// Postponement and cancellation (ADR 0065): a canceled event takes no more sales.
        pub change: EventChangeDto,
        /// End, in the event's own offset (reservations end before it).
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
        /// The event's UTC offset in minutes (reservation deadlines are in its time).
        pub utc_offset_minutes: i16,
        /// One of several dates (ADR 0077): the page says which session the link is for.
        #[serde(default)]
        pub in_series: bool,
        /// Tickets or consumption tokens (ADR 0084).
        #[serde(default)]
        pub kind: EventKind,
    }

    /// `POST /api/seller`: everything the seller's page shows (ADR 0053).
    pub struct SellerViewDto {
        /// The event.
        pub event: SellerViewEvent,
        /// Who runs the event: name, logo and contact (ADR 0064).
        pub organization: PublicOrganizationDto,
        /// The seller's name.
        pub seller: String,
        /// Printed prefix of the number (`Nº`).
        pub number_prefix: String,
        /// Printed digits of the number (zero padding).
        pub number_digits: u8,
        /// Paid numbers the seller holds, ordered.
        pub ranges: Vec<NumberRangeDto>,
        /// Parts of them that no longer count.
        pub voids: Vec<SellerVoidDto>,
        /// Numbers marked as sold, by number.
        pub sales: Vec<SellerSaleDto>,
        /// Money recorded by the organizer, newest first.
        pub payments: Vec<SellerViewPaymentDto>,
        /// The totals.
        pub summary: SellerSummaryDto,
        /// Names of who receives the sellers' money on the team (ADR 0055), if any.
        pub receivers: Vec<String>,
        /// The event's categories (ADR 0056), to tell which numbers are meia, VIP…
        pub categories: Vec<SellerCategoryDto>,
        /// The seller may send digital tickets of what they sold (ADR 0061).
        pub can_send_tickets: bool,
        /// The seller is the box office (ADR 0069): what entered counts as sold.
        pub box_office: bool,
        /// The seller's reservations (ADR 0072): active first, then the recently expired.
        pub reservations: Vec<ReservationDto>,
        /// Tickets the seller aims to sell (ADR 0073).
        pub goal: Option<i32>,
        /// Where the seller stands among the others, when the organizer shows it (ADR 0073).
        pub ranking: Option<SellerRankingDto>,
        /// How buyers pay by Pix (ADR 0085); `null` when the event does not charge by Pix.
        #[serde(default)]
        pub pix: Option<SellerViewPixDto>,
    }

    /// The Pix the seller's buyers pay (ADR 0085).
    pub struct SellerViewPixDto {
        /// Whose key: the organization's or the seller's own.
        pub payee: PixPayee,
        /// The key, the receiver and the city.
        pub account: PixAccountDto,
        /// The event, for each number's payment identifier (the same the panel shows).
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub event_id: Uuid,
    }

    /// `POST /api/seller/pix`: the seller saw a buyer's Pix arrive on their own key (or undoes it).
    pub struct SellerPixBody {
        /// Token from the link's fragment.
        pub token: String,
        /// A number the seller sold.
        pub number: i32,
        /// Received (`true`) or not yet (`false`).
        pub paid: bool,
    }

    /// An inclusive range of ticket numbers.
    pub struct RangeBody {
        /// First number.
        pub first: i32,
        /// Last number (inclusive).
        pub last: i32,
    }

    /// `POST /api/sellers/{id}/ranges/remaining`: every number still free goes to the seller.
    pub struct AssignRemainingBody {
        /// Only the numbers of this category (ADR 0056); all of them when absent.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(type = "string | null", optional))]
        pub category_id: Option<Uuid>,
    }

    /// Numbers issued and still free: no seller holds them, not cancelled, not sent as a digital
    /// ticket by the organization (`GET /api/events/{id}/available-numbers`).
    pub struct AvailableNumbersDto {
        /// Free numbers, in order.
        pub ranges: Vec<NumberRangeDto>,
        /// How many numbers.
        pub count: i32,
    }

    /// An expense or other income of the event (ADR 0058).
    pub struct LedgerEntryDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Expense or income.
        pub kind: LedgerKind,
        /// What it was ("Buffet", "Doação da APM").
        pub description: String,
        /// Free grouping.
        pub category: Option<String>,
        /// Amount in centavos (positive).
        pub amount_cents: i32,
        /// Day, `YYYY-MM-DD`.
        pub occurred_on: String,
    }

    /// `POST /api/events/{id}/ledger`, `PUT /api/ledger/{id}`.
    pub struct LedgerBody {
        /// Expense or income.
        pub kind: LedgerKind,
        /// What it was (1–120 characters).
        pub description: String,
        /// Free grouping (up to 40 characters).
        pub category: Option<String>,
        /// Amount in centavos (1 to 100,000,000).
        pub amount_cents: i32,
        /// Day, `YYYY-MM-DD`.
        pub occurred_on: String,
    }

    /// `GET /api/events/{id}/accountability`: the whole picture for the group (ADR 0058).
    pub struct AccountabilityDto {
        /// Paid tickets.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub issued: i64,
        /// Declared sold (not returned unsold nor lost), courtesies included.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sold: i64,
        /// Tickets of categories priced zero.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub courtesies: i64,
        /// Tickets that entered.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
        /// What the sellers' tickets are worth (`null` without prices).
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub ticket_sales_cents: Option<i64>,
        /// Money the sellers handed over.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub received_cents: i64,
        /// Still with the sellers (`null` without prices).
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub outstanding_cents: Option<i64>,
        /// Other income written by the team.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub other_income_cents: i64,
        /// Expenses written by the team.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub expenses_cents: i64,
        /// Paid to Ingresso Impresso for the batches.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub platform_cents: i64,
        /// Received + other income − expenses − platform: the money in hand.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub balance_cents: i64,
        /// Expenses and other income, by day.
        pub entries_list: Vec<LedgerEntryDto>,
    }

    /// Paid tickets of one category in the report.
    pub struct ReportCategoryDto {
        /// Category; `null` for numbers without one.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub category_id: Option<Uuid>,
        /// Name; `null` without a category.
        pub name: Option<String>,
        /// Band colour.
        pub color: Option<String>,
        /// Price used (the category's, else the event's).
        pub price_cents: Option<i32>,
        /// Paid tickets.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub tickets: i64,
        /// Declared sold (not returned unsold nor lost).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sold: i64,
        /// Tickets that entered.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
        /// Sold × price, when there is a price.
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub amount_cents: Option<i64>,
    }

    /// A ticket category (ADR 0056).
    pub struct CategoryDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name ("Meia").
        pub name: String,
        /// Band colour (`#rrggbb`).
        pub color: String,
        /// Price; `null` uses the event's price, 0 is a courtesy.
        pub price_cents: Option<i32>,
        /// The door asks for a document before letting in (ADR 0082): meia-entrada.
        pub check_document: bool,
        /// Which documents count ("Carteira de estudante, RG de idoso…"); `null`: any proof.
        pub document_note: Option<String>,
        /// What the door hands over or checks when it enters (ADR 0089): "Pulseira laranja".
        pub door_instruction: Option<String>,
        /// On which days of an event of several days it is valid (ADR 0091).
        pub day_rule: DayRule,
        /// The days of `days` (1 for the first), in order.
        pub valid_days: Vec<u8>,
        /// Numbers in the category, ordered.
        pub ranges: Vec<RangeDto>,
    }

    /// `POST /api/events/{id}/categories`, `PUT /api/categories/{id}`.
    pub struct CategoryBody {
        /// Name (1–30 characters).
        pub name: String,
        /// Band colour (`#rrggbb`).
        pub color: String,
        /// Price; `null` uses the event's price.
        pub price_cents: Option<i32>,
        /// The door asks for a document (ADR 0082); missing: off.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub check_document: Option<bool>,
        /// Which documents count (up to 80 characters).
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional = nullable))]
        pub document_note: Option<String>,
        /// What the door hands over or checks (ADR 0089), up to 60 characters; missing or blank:
        /// none.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional = nullable))]
        pub door_instruction: Option<String>,
        /// On which days it is valid (ADR 0091); missing: every day.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub day_rule: Option<DayRule>,
        /// The days of `days` (1 for the first); ignored by the other rules.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub valid_days: Option<Vec<u8>>,
    }

    /// A table on the event's map (ADR 0057).
    pub struct TableDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name ("Mesa 5").
        pub name: String,
        /// Seats.
        pub seats: i16,
        /// Drawing on the map.
        pub shape: TableShape,
        /// Centre on the map, as a fraction of its width (0–1).
        pub x: f32,
        /// Centre on the map, as a fraction of its height (0–1).
        pub y: f32,
        /// Tickets seated here, by seat.
        pub guests: Vec<SeatDto>,
    }

    /// A ticket in a seat.
    pub struct SeatDto {
        /// Ticket number.
        pub number: i32,
        /// Seat (1 to the table's seats).
        pub seat: i16,
    }

    /// `POST /api/events/{id}/tables`, `PUT /api/tables/{id}`.
    pub struct TableBody {
        /// Name (1–30 characters).
        pub name: String,
        /// Seats (1–50).
        pub seats: i16,
        /// Drawing on the map.
        pub shape: TableShape,
        /// Centre on the map (0–1); `null` places it after the others.
        pub x: Option<f32>,
        /// Centre on the map (0–1).
        pub y: Option<f32>,
    }

    /// `POST /api/events/{id}/tables/bulk`: several tables at once ("Mesa 1" to "Mesa 20").
    pub struct TablesBulkBody {
        /// How many (1–200).
        pub count: i16,
        /// Seats of each.
        pub seats: i16,
        /// Drawing on the map.
        pub shape: TableShape,
        /// Name before the number ("Mesa").
        pub prefix: String,
    }

    /// `PUT /api/events/{id}/tables/layout`: positions after dragging.
    pub struct TablesLayoutBody {
        /// New positions.
        pub positions: Vec<TablePositionDto>,
    }

    /// Where a table sits on the map.
    pub struct TablePositionDto {
        /// Table id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Centre (0–1).
        pub x: f32,
        /// Centre (0–1).
        pub y: f32,
    }

    /// `POST /api/tables/{id}/tickets`: seats tickets in the free seats, in order.
    pub struct SeatTicketsBody {
        /// Ticket numbers (inclusive ranges).
        pub ranges: Vec<NumberRangeDto>,
        /// Move tickets already seated at another table.
        pub move_seated: bool,
    }

    /// `POST /api/tables/{id}/tickets/remove`.
    pub struct UnseatBody {
        /// Ticket number.
        pub number: i32,
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

    /// `POST /api/sellers/{id}/payments`: money a seller handed over (ADR 0050).
    pub struct SellerPaymentBody {
        /// Amount in cents (1 to 100,000,000).
        pub amount_cents: i32,
        /// How it was paid.
        pub method: SellerPaymentMethod,
        /// Day it was received, `YYYY-MM-DD`.
        pub received_on: String,
        /// Free note (up to 200 characters, one line).
        pub note: Option<String>,
    }

    /// Money a seller handed over.
    pub struct SellerPaymentDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Seller.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub seller_id: Uuid,
        /// Amount in cents.
        pub amount_cents: i32,
        /// How it was paid.
        pub method: SellerPaymentMethod,
        /// Day it was received, `YYYY-MM-DD`.
        pub received_on: String,
        /// Note.
        pub note: Option<String>,
        /// When it was recorded.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// `POST /api/sellers/{id}/returns`: tickets a seller gave back unsold, or lost (ADR 0050).
    /// Every range must lie inside the seller's ranges and not be voided yet; all are voided
    /// together or none is.
    pub struct SellerReturnBody {
        /// The returned numbers, as inclusive ranges (1 to 100 of them, not overlapping).
        pub ranges: Vec<RangeBody>,
        /// `unsold` or `lost`.
        pub reason: VoidReason,
        /// Free note (up to 200 characters).
        pub note: Option<String>,
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
        /// Covers a refunded batch: permanent, cannot be undone (ADR 0032).
        pub locked: bool,
        /// The number sent instead, when this void is a replacement of a lost ticket (ADR 0061).
        pub replaced_by: Option<i32>,
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

    /// `POST /api/events/{id}/door/accesses`.
    pub struct CreateDoorAccessBody {
        /// Who the link is for, e.g. "Equipe da porta" (1–60 characters).
        pub label: String,
        /// Categories this door admits (ADR 0068); empty or missing: every ticket.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional, as = "Option<Vec<String>>"))]
        pub category_ids: Option<Vec<Uuid>>,
        /// A link of a checkpoint (ADR 0092) instead of the entrance; missing: the entrance.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional, as = "Option<String>"))]
        pub checkpoint_id: Option<Uuid>,
    }

    /// A door access link (ADR 0007). The token itself is shown only once, at creation.
    pub struct DoorAccessDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Label.
        pub label: String,
        /// The link stops working at the end of the event plus 12 hours.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub expires_at: OffsetDateTime,
        /// When it was revoked, if it was.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub revoked_at: Option<OffsetDateTime>,
        /// Created at.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// Categories this door admits (ADR 0068); empty: every ticket.
        #[cfg_attr(feature = "ts", ts(type = "string[]"))]
        pub category_ids: Vec<Uuid>,
        /// The checkpoint the link reads (ADR 0092); `null`: the entrance.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub checkpoint_id: Option<Uuid>,
    }

    /// A new access link with its token (never retrievable again).
    pub struct CreatedDoorAccess {
        /// The link.
        pub access: DoorAccessDto,
        /// Secret token; the painel builds `/portaria/#acesso=<token>` with it.
        pub token: String,
    }

    /// A registered door phone, as the organizer sees it.
    pub struct DoorDeviceDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Access link it registered with.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub access_id: Uuid,
        /// Name given at registration, e.g. "Porta 1 - João".
        pub name: String,
        /// Registered at.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// Last contact with the server.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub last_seen_at: Option<OffsetDateTime>,
        /// When it was revoked, if it was.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub revoked_at: Option<OffsetDateTime>,
        /// Scans received from it.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub scan_count: i64,
        /// When it finished a rehearsal (ADR 0067).
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub rehearsed_at: Option<OffsetDateTime>,
        /// Last manifest it downloaded (ADR 0071).
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub last_sync_at: Option<OffsetDateTime>,
        /// Scans and arrivals it still had to send at its last sync (`null`: not reported).
        pub pending_scans: Option<i32>,
    }

    /// `GET /api/events/{id}/door`.
    pub struct DoorOverviewDto {
        /// Access links, newest first.
        pub accesses: Vec<DoorAccessDto>,
        /// Registered phones, newest first.
        pub devices: Vec<DoorDeviceDto>,
        /// Tickets that entered.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entry_count: i64,
        /// Whether a ticket that went out may come back in (ADR 0083).
        pub reentry: bool,
        /// The event's checkpoints (ADR 0092).
        #[serde(default)]
        pub checkpoints: Vec<CheckpointDto>,
    }

    /// `PUT /api/events/{id}/door-settings`: how the door works (ADR 0083).
    pub struct DoorSettingsBody {
        /// Let a ticket that went out come back in.
        pub reentry: bool,
    }

    /// `POST /api/door/register`.
    pub struct DoorRegisterBody {
        /// Token from the link fragment.
        pub access_token: String,
        /// Phone name shown in results, e.g. "Porta 1 - João" (1–40 characters).
        pub device_name: String,
    }

    /// A registered phone's credentials.
    pub struct DoorRegistration {
        /// Device id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub device_id: Uuid,
        /// Device name.
        pub device_name: String,
        /// Bearer secret of the door API; stored on the phone only.
        pub device_secret: String,
        /// The event.
        pub event: DoorEventInfo,
        /// The checkpoint this phone reads (ADR 0092); `null`: the entrance.
        #[serde(default)]
        pub checkpoint: Option<DoorCheckpointDto>,
    }

    /// The checkpoint a door phone reads (ADR 0092).
    pub struct DoorCheckpointDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name ("Janta").
        pub name: String,
        /// What to hand over ("Entregar o prato").
        pub instruction: Option<String>,
        /// One use per day the ticket is valid; otherwise one use in the whole event.
        pub per_day: bool,
        /// Categories entitled to it; empty: every ticket.
        #[cfg_attr(feature = "ts", ts(type = "string[]"))]
        pub category_ids: Vec<Uuid>,
    }

    /// The event as the door shows it.
    pub struct DoorEventInfo {
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
        /// Digits of printed numbers (zero padded).
        pub number_digits: u8,
        /// Ticket price, charged by the box office (ADR 0069) when the category has none.
        #[serde(default)]
        pub ticket_price_cents: Option<i32>,
        /// When the organizer canceled the event (ADR 0065): the door shows it and keeps
        /// reading, the organizer decides.
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub canceled_at: Option<OffsetDateTime>,
        /// One of several dates (ADR 0077): the door says which session it is for.
        #[serde(default)]
        pub in_series: bool,
        /// A ticket that went out may come back in (ADR 0083): the door offers the exit.
        #[serde(default)]
        pub reentry: bool,
        /// Tickets or consumption tokens (ADR 0084): the door speaks of a ficha at a stall.
        #[serde(default)]
        pub kind: EventKind,
        /// The days of an event of several days (ADR 0091); empty: one day.
        #[serde(default)]
        pub days: Vec<EventDayDto>,
    }

    /// What `DoorCore` needs to verify tickets; same shape as ticket-core's `DoorEventDto`.
    pub struct DoorVerifierDto {
        /// Event UUID, hyphenated.
        pub event_id: String,
        /// Event tag printed in the QR.
        pub event_tag: u32,
        /// Every key of the event, revoked ones included.
        pub keys: Vec<DoorKeyDto>,
    }

    /// A public key; same shape as ticket-core's `EventKeyDto`.
    pub struct DoorKeyDto {
        /// Key generation.
        pub key_id: u8,
        /// Ed25519 public key, 64 lowercase hex characters.
        pub public_key: String,
        /// Lifecycle.
        pub status: KeyStatus,
    }

    /// A voided range; same shape as ticket-core's `VoidRangeDto`.
    pub struct DoorVoidDto {
        /// First number.
        pub first: u32,
        /// Last number (inclusive).
        pub last: u32,
        /// Why.
        pub reason: VoidReason,
    }

    /// A seller's range, to show who sold a ticket.
    pub struct DoorSellerRangeDto {
        /// Seller name.
        pub seller: String,
        /// First number.
        pub first: u32,
        /// Last number (inclusive).
        pub last: u32,
        /// The seller is the box office (ADR 0069): these numbers are sold at the door.
        #[serde(default)]
        pub box_office: bool,
    }

    /// Numbers of one category, for the door.
    pub struct DoorCategoryRangeDto {
        /// Category id (ADR 0068), to tell whether this door admits it.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Category name.
        pub name: String,
        /// Band colour (`#rrggbb`).
        pub color: String,
        /// First number.
        pub first: u32,
        /// Last number (inclusive).
        pub last: u32,
        /// The category's own price (`null`: the event's; 0: courtesy), for the box office.
        #[serde(default)]
        pub price_cents: Option<i32>,
        /// Ask for a document before letting in (ADR 0082).
        #[serde(default)]
        pub check_document: bool,
        /// Which documents count.
        #[serde(default)]
        pub document_note: Option<String>,
        /// What to hand over or check when it enters (ADR 0089).
        #[serde(default)]
        pub door_instruction: Option<String>,
        /// On which days it is valid (ADR 0091).
        #[serde(default)]
        pub day_rule: DayRule,
        /// The days of `days` (1 for the first).
        #[serde(default)]
        pub valid_days: Vec<u8>,
    }

    /// The table and seat of a ticket, for the door.
    pub struct DoorSeatDto {
        /// Ticket number.
        pub number: u32,
        /// `Mesa 5 · Lugar 3`.
        pub label: String,
    }

    /// An admitted scan of any phone; same fields as ticket-core's `EntryDto` plus its id.
    pub struct DoorEntryDto {
        /// Scan id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub scan_id: Uuid,
        /// Ticket number.
        pub number: u32,
        /// Unix milliseconds (phone clock corrected by the server offset).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub at_unix_ms: i64,
        /// Name of the phone that scanned it.
        pub device_name: String,
        /// The event day it was read on (ADR 0091); `null` for an event of one day.
        #[serde(default)]
        pub day: Option<u8>,
        /// The day of the book it counts in; `null`: the whole event.
        #[serde(default)]
        pub ledger_day: Option<u8>,
    }

    /// `GET /api/door/manifest?since=<cursor>`: everything needed to decide offline.
    pub struct DoorManifest {
        /// This phone.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub device_id: Uuid,
        /// This phone's name.
        pub device_name: String,
        /// The event.
        pub event: DoorEventInfo,
        /// Verification keys.
        pub verifier: DoorVerifierDto,
        /// Every active void (sent whole: small).
        pub voids: Vec<DoorVoidDto>,
        /// Every seller range (sent whole: small).
        pub sellers: Vec<DoorSellerRangeDto>,
        /// Every category range (ADR 0056), to show the category on the result screen.
        #[serde(default)]
        pub categories: Vec<DoorCategoryRangeDto>,
        /// Every seated ticket (ADR 0057), to tell the guest their table.
        #[serde(default)]
        pub seats: Vec<DoorSeatDto>,
        /// Admitted scans since `since` (first entries and returns), from every phone.
        pub entries: Vec<DoorEntryDto>,
        /// Exits since `since` (ADR 0083), from every phone.
        #[serde(default)]
        pub exits: Vec<DoorEntryDto>,
        /// Opaque cursor for the next call.
        pub cursor: String,
        /// Server clock, Unix milliseconds.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub server_time_ms: i64,
        /// Categories this phone's door admits (ADR 0068); empty: every ticket.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(type = "string[]"))]
        pub allowed_category_ids: Vec<Uuid>,
        /// The event's other open doors, to send a guest to the right one.
        #[serde(default)]
        pub doors: Vec<DoorRouteDto>,
        /// The guest list (ADR 0070), only when it changed since `guests=<version>`.
        #[serde(default)]
        pub guests: Option<Vec<DoorGuestDto>>,
        /// Version of the guest list, for the next call.
        #[serde(default)]
        pub guests_version: String,
        /// Guest arrivals (and undos) since `since`, from every phone.
        #[serde(default)]
        pub guest_arrivals: Vec<DoorGuestArrivalDto>,
        /// The other dates of the series (ADR 0077), to tell a ticket of another session apart
        /// from one of another event. Their tickets never enter here.
        #[serde(default)]
        pub sessions: Vec<DoorSessionDto>,
        /// The checkpoint this phone reads (ADR 0092); `null`: the entrance. A checkpoint's
        /// `entries` are its uses, never the entrance's.
        #[serde(default)]
        pub checkpoint: Option<DoorCheckpointDto>,
    }

    /// Another date of the event's series.
    pub struct DoorSessionDto {
        /// The QR tag of that date.
        pub event_tag: u32,
        /// Its start, with its offset.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
    }

    /// One scan uploaded by a phone.
    pub struct DoorScanUpload {
        /// Generated on the phone (uploads are idempotent).
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Ticket number, when the QR was authentic.
        pub number: Option<u32>,
        /// Key generation, when the QR was authentic.
        pub key_id: Option<u8>,
        /// Decision shown on the phone.
        pub outcome: ScanOutcome,
        /// Unix milliseconds (phone clock corrected by the server offset).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub scanned_at_ms: i64,
        /// Let in although this door does not take its category (ADR 0068).
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub exception: Option<bool>,
        /// Why it was let in anyway (ADRs 0091, 0092); missing with `exception`: the wrong door.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub exception_kind: Option<ExceptionKind>,
        /// The event day the phone was on (ADR 0091).
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub day: Option<u8>,
        /// The day of the book it was decided in; missing: the whole event.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub ledger_day: Option<u8>,
    }

    /// `POST /api/door/scans`.
    pub struct DoorScansBody {
        /// Up to 500 scans.
        pub scans: Vec<DoorScanUpload>,
        /// Online confirmation of a single fresh scan (ADR 0006): its result decides the screen.
        #[serde(default)]
        pub confirm: bool,
    }

    /// Server view of an uploaded scan.
    pub struct DoorScanResult {
        /// Scan id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// For admitted scans: first entry, return, duplicate or voided ticket.
        pub class: Option<ScanClass>,
        /// For duplicates: the first entry (with re-entry, the entry that holds now).
        pub first_entry: Option<DoorFirstEntryDto>,
        /// For voided tickets: why.
        pub void_reason: Option<VoidReason>,
    }

    /// When and where a ticket first entered.
    pub struct DoorFirstEntryDto {
        /// Unix milliseconds.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub at_unix_ms: i64,
        /// Phone name.
        pub device_name: String,
    }

    /// `POST /api/door/scans` response, in request order.
    pub struct DoorScansResponse {
        /// One result per uploaded scan.
        pub results: Vec<DoorScanResult>,
    }

    /// One line of the report: a seller, the unassigned tickets or the totals.
    pub struct ReportRowDto {
        /// Seller id; `null` for unassigned tickets and totals.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub seller_id: Option<Uuid>,
        /// Seller name; `null` for unassigned tickets and totals.
        pub seller: Option<String>,
        /// Paid tickets in the line (assigned to the seller, or unassigned).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub tickets: i64,
        /// Voided as returned unsold.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub unsold: i64,
        /// Voided as lost or stolen.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub lost: i64,
        /// Voided for another reason.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revoked: i64,
        /// Declared sold: tickets − unsold − lost.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub declared_sold: i64,
        /// Tickets that entered.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
        /// Copies that entered through phones offline (found on sync).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub offline_duplicates: i64,
        /// Copies stopped at the door (locally or by the online confirmation).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub blocked_copies: i64,
        /// Voided tickets that entered (the phone did not know about the void yet).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub void_entries: i64,
        /// Declared sold × price (each number's category price, else the event's), when every
        /// such number has a price.
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub amount_due_cents: Option<i64>,
        /// Money the seller handed over (ADR 0050), with the buyers' Pix the organization received
        /// for their numbers (ADR 0085); on the unassigned line, that Pix only.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub received_cents: i64,
        /// Of `received_cents`, the buyers' Pix received by the organization (ADR 0085).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub pix_cents: i64,
        /// Amount due − received: positive is still owed, negative was overpaid. `null` without
        /// a ticket price and on the unassigned line (nobody owes those tickets).
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub balance_cents: Option<i64>,
        /// Marked as sold by the seller on their link (ADR 0053), not voided.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub marked_sold: i64,
        /// Reserved for someone and not sold yet (ADR 0072): still the seller's, not money.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub reserved: i64,
        /// A box office seller (ADR 0069): sold = numbers that entered.
        pub box_office: bool,
    }

    /// What one door phone did.
    pub struct ReportDeviceDto {
        /// Phone name.
        pub name: String,
        /// Every scan.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub scans: i64,
        /// First entries recorded by this phone.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub first_entries: i64,
        /// Copies it let in while offline.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub offline_duplicates: i64,
        /// Copies it stopped.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub blocked_copies: i64,
        /// Forged, damaged or foreign QR codes read.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub invalid: i64,
    }

    /// `GET /api/events/{id}/report`: settlement per seller and door activity.
    pub struct EventReportDto {
        /// Ticket price used for the amounts.
        pub ticket_price_cents: Option<i32>,
        /// One line per seller, in name order (sellers without tickets included).
        pub sellers: Vec<ReportRowDto>,
        /// Paid tickets without a seller.
        pub unassigned: ReportRowDto,
        /// Sum of every line.
        pub totals: ReportRowDto,
        /// Paid tickets by category (ADR 0056); empty without categories. The line without a
        /// category has `categoryId: null`.
        pub categories: Vec<ReportCategoryDto>,
        /// Door phones, in name order.
        pub devices: Vec<ReportDeviceDto>,
        /// Scans of forged, damaged or unknown QR codes.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub invalid_scans: i64,
        /// Scans of tickets of other events.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub other_event_scans: i64,
        /// When the report was computed.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub generated_at: OffsetDateTime,
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

    /// What an event prints (ADR 0084): tickets for the entrance or consumption tokens (fichas).
    pub enum EventKind {
        /// Tickets, checked at the door.
        Tickets,
        /// Consumption tokens, each used once at a stall; the categories are the products.
        Tokens,
    }

    /// Who the buyers' Pix of an event pays (ADR 0085).
    pub enum PixReceiver {
        /// No Pix on the seller's page nor on the digital tickets.
        Off,
        /// The organization's key.
        Organization,
        /// Each number's seller, with their own key; the organization's without one.
        Seller,
    }

    /// Whose key a number's Pix pays, and who confirmed seeing it.
    pub enum PixPayee {
        /// The organization.
        Organization,
        /// The seller of the number.
        Seller,
    }

    /// Kind of a Pix key (ADR 0085), as the Pix directory (DICT) has them.
    pub enum PixKeyType {
        /// CPF, 11 digits.
        Cpf,
        /// CNPJ, numeric or alphanumeric, 14 characters.
        Cnpj,
        /// E-mail.
        Email,
        /// Brazilian phone, `+55…`.
        Phone,
        /// Random key (EVP), a UUID.
        Random,
    }

    /// Batch payment status.
    pub enum BatchStatus {
        /// Waiting for payment (no ticket is signed).
        AwaitingPayment,
        /// Paid: tickets can be generated.
        Paid,
        /// Canceled before payment.
        Canceled,
        /// Paid, then refunded by an admin: its numbers stay taken and voided.
        Refunded,
    }

    /// How a batch was paid.
    pub enum PaymentMethod {
        /// Online, through Stripe Checkout.
        Stripe,
        /// Marked as paid by an admin.
        Admin,
        /// Entirely covered by the organization's free tickets (or a 100% discount).
        Free,
        /// Covered by the organization's credit (ADR 0040).
        Credit,
    }

    /// An unsettled online payment of a batch.
    pub enum PaymentState {
        /// The Stripe payment page is open.
        Open,
        /// Paid by Pix, waiting for Stripe to confirm the transfer.
        Processing,
    }

    /// What became of a change of the seller's page (ADR 0074).
    pub enum SellerOpOutcome {
        /// Done.
        Applied,
        /// Done for some numbers; `problems` says which were left out.
        Partial,
        /// Not done.
        Rejected,
    }

    /// Why a change of the seller's page left numbers out.
    pub enum SellerOpProblem {
        /// Marked as sold already (on another phone, or by the organizer).
        AlreadySold,
        /// No longer with the seller (taken back by the organizer, or its batch canceled).
        NotHeld,
        /// Returned, lost or canceled.
        Voided,
        /// Reserved for someone else.
        Reserved,
        /// The reservation's deadline passed before the change reached the server.
        Expired,
        /// The event was canceled.
        EventCanceled,
        /// A box office does not reserve.
        BoxOffice,
        /// Its Pix arrived (ADR 0085): only the organization undoes the receipt, then the sale.
        PixReceived,
        /// Something the page should not have sent (a name too long, a bad number).
        Invalid,
    }

    /// How a seller handed money over.
    pub enum SellerPaymentMethod {
        /// Pix transfer.
        Pix,
        /// Cash.
        Cash,
        /// Anything else (card, bank transfer...).
        Other,
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

    /// Signing key lifecycle.
    pub enum KeyStatus {
        /// Signs new batches.
        Active,
        /// No longer signs; its tickets stay valid.
        Retired,
        /// Compromised; its tickets are rejected.
        Revoked,
    }

    /// Decision shown on the phone for a scan.
    pub enum ScanOutcome {
        /// Green: entered.
        Admitted,
        /// Red: already entered.
        RejectedUsed,
        /// Red: voided ticket.
        RejectedVoid,
        /// Red: forged, damaged or not ours.
        RejectedInvalid,
        /// Yellow: ticket of another event.
        RejectedOtherEvent,
        /// Yellow: a category this door does not take (ADR 0068); no entry recorded.
        RejectedWrongDoor,
        /// Green: went out and came back in (re-entry, ADR 0083).
        Readmitted,
        /// Blue: went out, may come back (re-entry, ADR 0083).
        Exited,
        /// Yellow: read again on the way out; nothing recorded.
        RejectedAlreadyOut,
        /// Yellow: its category is not valid today (ADR 0091); no entry recorded.
        RejectedWrongDay,
        /// Green, at a checkpoint (ADR 0092): the benefit was handed over.
        BenefitGranted,
        /// Red, at a checkpoint: already used.
        RejectedBenefitUsed,
        /// Yellow, at a checkpoint: its category has no right to it.
        RejectedNotEntitled,
    }

    /// Why a ticket was let in anyway.
    pub enum ExceptionKind {
        /// A door that does not take its category (ADR 0068).
        WrongDoor,
        /// A day its category is not valid on (ADR 0091).
        WrongDay,
        /// A checkpoint its category has no right to (ADR 0092).
        NotEntitled,
    }

    /// On which days of an event of several days a category is valid (ADR 0091).
    pub enum DayRule {
        /// Every day, one entry a day.
        Every,
        /// Only on the chosen days, one entry on each.
        Days,
        /// One day of the holder's choice: one entry in the whole event.
        AnyOne,
    }

    /// Kind of a changelog note.
    pub enum ChangelogKind {
        /// A new feature.
        New,
        /// Something that got better.
        Improvement,
        /// A bug fixed.
        Fix,
        /// A security change.
        Security,
    }

    /// A ticket as the door sees it now.
    pub enum TicketState {
        /// Can enter.
        Valid,
        /// Voided: blocked at the door.
        Voided,
        /// Already entered.
        Entered,
    }

    /// Server classification of an admitted scan.
    pub enum ScanClass {
        /// First entry of the ticket.
        FirstEntry,
        /// The ticket had already entered (a copy).
        DuplicateEntry,
        /// The ticket is voided.
        VoidEntry,
        /// A return of a ticket that went out (ADR 0083).
        Reentry,
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

/// One change of the seller's page (ADR 0074).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub enum SellerOp {
    /// Numbers sold, all to one buyer.
    Mark {
        /// The numbers (1 to 100 ranges, up to 1,000 numbers).
        ranges: Vec<RangeBody>,
        /// Buyer's name.
        buyer_name: Option<String>,
        /// Buyer's phone.
        buyer_phone: Option<String>,
        /// Changes the buyer of numbers sold already (otherwise they are a conflict).
        edit: bool,
        /// The reservation the page showed on these numbers: it becomes the sale. A number
        /// reserved by another one is a conflict.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        reservation_id: Option<Uuid>,
    },
    /// A sale marked by mistake.
    Unmark {
        /// The number.
        number: i32,
    },
    /// Numbers held for a person until a deadline; the same id again changes the person or
    /// the deadline.
    Reserve {
        /// Id created on the phone.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        reservation_id: Uuid,
        /// The numbers.
        ranges: Vec<RangeBody>,
        /// For whom.
        holder_name: String,
        /// Their phone.
        holder_phone: Option<String>,
        /// Until when.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        expires_at: OffsetDateTime,
    },
    /// A reservation given up: its numbers are free again.
    CancelReservation {
        /// The reservation.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        reservation_id: Uuid,
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
db_enum!(EventKind { Tickets => "tickets", Tokens => "tokens" });
db_enum!(PixKeyType { Cpf => "cpf", Cnpj => "cnpj", Email => "email", Phone => "phone", Random => "random" });
db_enum!(PixReceiver { Off => "off", Organization => "organization", Seller => "seller" });
db_enum!(PixPayee { Organization => "organization", Seller => "seller" });

/// Events print tickets unless they say otherwise; apps and pages saved before ADR 0084 get them.
impl Default for EventKind {
    fn default() -> Self {
        Self::Tickets
    }
}
db_enum!(BatchStatus { AwaitingPayment => "awaiting_payment", Paid => "paid", Canceled => "canceled", Refunded => "refunded" });
db_enum!(ChangelogKind { New => "new", Improvement => "improvement", Fix => "fix", Security => "security" });
db_enum!(PaymentMethod { Stripe => "stripe", Admin => "admin", Free => "free", Credit => "credit" });
db_enum!(PaymentState { Open => "open", Processing => "processing" });
db_enum!(VoidReason { Unsold => "unsold", Lost => "lost", Revoked => "revoked" });
db_enum!(SellerPaymentMethod { Pix => "pix", Cash => "cash", Other => "other" });
db_enum!(ExportKind { Home => "home", Print => "print", Control => "control", Whatsapp => "whatsapp" });
db_enum!(ExportStatus { Queued => "queued", Running => "running", Done => "done", Failed => "failed" });
db_enum!(KeyStatus { Active => "active", Retired => "retired", Revoked => "revoked" });
db_enum!(ScanOutcome {
    Admitted => "admitted",
    RejectedUsed => "rejected_used",
    RejectedVoid => "rejected_void",
    RejectedInvalid => "rejected_invalid",
    RejectedOtherEvent => "rejected_other_event",
    RejectedWrongDoor => "rejected_wrong_door",
    Readmitted => "readmitted",
    Exited => "exited",
    RejectedAlreadyOut => "rejected_already_out",
    RejectedWrongDay => "rejected_wrong_day",
    BenefitGranted => "benefit_granted",
    RejectedBenefitUsed => "rejected_benefit_used",
    RejectedNotEntitled => "rejected_not_entitled",
});
db_enum!(ExceptionKind { WrongDoor => "wrong_door", WrongDay => "wrong_day", NotEntitled => "not_entitled" });
db_enum!(DayRule { Every => "every", Days => "days", AnyOne => "any_one" });

/// A category is valid every day unless it says otherwise (ADR 0091); manifests and pages saved
/// before it get that.
impl Default for DayRule {
    fn default() -> Self {
        Self::Every
    }
}
db_enum!(ScanClass {
    FirstEntry => "first_entry",
    DuplicateEntry => "duplicate_entry",
    VoidEntry => "void_entry",
    Reentry => "reentry",
});

// Platform controls (ADRs 0037–0043) --------------------------------------------------------

dto! {
    /// Maintenance state (ADR 0037).
    pub struct MaintenanceDto {
        /// `off`, `read_only` (organizers only read) or `full` (only admins get in).
        pub mode: MaintenanceMode,
        /// Message from the team, shown to organizers.
        pub message: Option<String>,
        /// When the team expects to be back (informative).
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub ends_at: Option<OffsetDateTime>,
        /// When the current mode started.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub started_at: Option<OffsetDateTime>,
    }

    /// A promotion running now (ADR 0039).
    pub struct ActivePromotionDto {
        /// Name.
        pub name: String,
        /// Public sentence ("Semana do rock: 20% off").
        pub headline: Option<String>,
        /// Discount on every batch.
        pub discount_percent: i32,
        /// When it ends.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
    }

    /// `GET /api/platform` (no login): what every screen needs to know about the service.
    pub struct PlatformStatusDto {
        /// Maintenance.
        pub maintenance: MaintenanceDto,
        /// Whether new accounts can be created.
        pub registrations_open: bool,
        /// The best promotion running now.
        pub promotion: Option<ActivePromotionDto>,
        /// When announced new prices start (the price table says which).
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub new_prices_at: Option<OffsetDateTime>,
    }

    /// `GET|PUT /api/admin/settings`.
    pub struct PlatformSettingsDto {
        /// Maintenance.
        pub maintenance: MaintenanceDto,
        /// Whether new accounts can be created.
        pub registrations_open: bool,
        /// Domains whose addresses cannot create an account (subdomains included).
        pub blocked_email_domains: Vec<String>,
        /// Last change.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub updated_at: OffsetDateTime,
        /// Admin who made it.
        pub updated_by: Option<String>,
    }

    /// `PUT /api/admin/settings`: every switch is sent, so a partial body never reopens anything.
    pub struct PlatformSettingsBody {
        /// Maintenance mode.
        pub maintenance_mode: MaintenanceMode,
        /// Message (up to 500 characters).
        pub maintenance_message: Option<String>,
        /// Expected end.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub maintenance_ends_at: Option<OffsetDateTime>,
        /// New accounts.
        pub registrations_open: bool,
        /// Blocked domains, one per entry (normalized by the server).
        pub blocked_email_domains: Vec<String>,
    }

    /// An announcement as an organizer sees it (ADR 0038).
    pub struct AnnouncementDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Title.
        pub title: String,
        /// Text (paragraphs separated by blank lines).
        pub body: String,
        /// Tone.
        pub level: AnnouncementLevel,
        /// Bell only, or also a dialog on opening the panel.
        pub display: AnnouncementDisplay,
        /// Button text.
        pub cta_label: Option<String>,
        /// Button target: a path of the site or an https URL.
        pub cta_url: Option<String>,
        /// When it started showing.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// The user opened the bell or the dialog.
        pub seen: bool,
        /// The user closed the dialog.
        pub dismissed: bool,
    }

    /// One notification of the signed-in user (ADR 0038). The panel writes the text from `kind`
    /// and `data`.
    pub struct NotificationDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// What happened.
        pub kind: NotificationKind,
        /// Details (event name, amount...).
        #[cfg_attr(feature = "ts", ts(type = "Record<string, unknown>"))]
        pub data: serde_json::Value,
        /// When the user read it.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub read_at: Option<OffsetDateTime>,
        /// When.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// `GET /api/inbox`: what the bell shows (announcements and notifications, newest first).
    pub struct InboxDto {
        /// Announcements running now.
        pub announcements: Vec<AnnouncementDto>,
        /// The latest notifications.
        pub notifications: Vec<NotificationDto>,
        /// Unseen announcements plus unread notifications.
        pub unread: i32,
        /// Publication time of the newest release note the account has seen (ADR 0088); `null`:
        /// none yet.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub news_seen_at: Option<OffsetDateTime>,
    }

    /// `POST /api/inbox/read`: marks things as seen/read (empty lists: everything).
    pub struct InboxReadBody {
        /// Announcements seen.
        #[cfg_attr(feature = "ts", ts(type = "string[]"))]
        pub announcements: Vec<Uuid>,
        /// Notifications read.
        #[cfg_attr(feature = "ts", ts(type = "string[]"))]
        pub notifications: Vec<Uuid>,
        /// Release notes seen up to this publication time (ADR 0088); never moves back.
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(optional, type = "string"))]
        pub news_seen_at: Option<OffsetDateTime>,
    }

    /// Reads of an announcement.
    pub struct AnnouncementStatsDto {
        /// Accounts that can see it.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub audience: i64,
        /// Accounts that saw it.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub seen: i64,
        /// Accounts that closed its dialog.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub dismissed: i64,
    }

    /// An announcement in the admin panel.
    pub struct AdminAnnouncementDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Title.
        pub title: String,
        /// Text.
        pub body: String,
        /// Tone.
        pub level: AnnouncementLevel,
        /// Bell only or dialog.
        pub display: AnnouncementDisplay,
        /// Button text.
        pub cta_label: Option<String>,
        /// Button target.
        pub cta_url: Option<String>,
        /// Start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// End (none: until archived).
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub ends_at: Option<OffsetDateTime>,
        /// Derived status.
        pub status: AnnouncementStatus,
        /// Publication time.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub published_at: Option<OffsetDateTime>,
        /// Reads.
        pub stats: AnnouncementStatsDto,
        /// Author.
        pub created_by: Option<String>,
        /// Creation time.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// `POST /api/admin/announcements` and `PUT /api/admin/announcements/{id}`.
    pub struct AnnouncementBody {
        /// Title (3–120 characters).
        pub title: String,
        /// Text (up to 4,000 characters).
        pub body: String,
        /// Tone.
        pub level: AnnouncementLevel,
        /// Bell only or dialog.
        pub display: AnnouncementDisplay,
        /// Button text (with `ctaUrl`).
        pub cta_label: Option<String>,
        /// Button target (with `ctaLabel`): `/path` or `https://...`.
        pub cta_url: Option<String>,
        /// Start (default: now).
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub starts_at: Option<OffsetDateTime>,
        /// End.
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub ends_at: Option<OffsetDateTime>,
        /// Publish now (otherwise a draft).
        pub publish: bool,
    }

    /// One version of the price table (ADR 0039).
    pub struct PriceTableDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Tiers.
        pub tiers: Vec<PriceTierDto>,
        /// Smallest charge, in centavos.
        pub minimum_cents: i32,
        /// Free tickets of every organization.
        pub free_tickets: i32,
        /// When it starts.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub effective_at: OffsetDateTime,
        /// Note of the admin.
        pub note: Option<String>,
        /// Author.
        pub created_by: Option<String>,
        /// Creation time.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// `GET /api/admin/prices`.
    pub struct AdminPricesDto {
        /// In force now.
        pub current: PriceTableDto,
        /// Announced, starting later.
        pub upcoming: Option<PriceTableDto>,
        /// Every version, newest first.
        pub history: Vec<PriceTableDto>,
    }

    /// `POST /api/admin/prices`: a new version of the price table.
    pub struct PriceTableBody {
        /// Tiers in increasing order; the last covers 5,000 tickets.
        pub tiers: Vec<PriceTierDto>,
        /// Smallest charge, in centavos.
        pub minimum_cents: i32,
        /// Free tickets of every organization.
        pub free_tickets: i32,
        /// Start (default: now).
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub effective_at: Option<OffsetDateTime>,
        /// Note (up to 200 characters).
        pub note: Option<String>,
        /// Tell every organizer with an announcement.
        pub announce: bool,
        /// How the announcement shows.
        pub announcement_display: AnnouncementDisplay,
    }

    /// A promotion in the admin panel.
    pub struct PromotionDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// Public sentence.
        pub headline: Option<String>,
        /// Discount.
        pub discount_percent: i32,
        /// Start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// End.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
        /// Switched on.
        pub active: bool,
        /// Batches created with it.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub batches: i64,
        /// Discount given, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub discount_cents: i64,
    }

    /// `POST /api/admin/promotions` and `PUT /api/admin/promotions/{id}`.
    pub struct PromotionBody {
        /// Name (up to 80 characters).
        pub name: String,
        /// Public sentence (up to 120 characters).
        pub headline: Option<String>,
        /// Discount, 1–100.
        pub discount_percent: i32,
        /// Start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// End.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
        /// Switched on.
        pub active: bool,
    }

    /// A promo code in the admin panel (ADR 0040).
    pub struct PromoCodeDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// The code (uppercase).
        pub code: String,
        /// What it gives.
        pub kind: PromoCodeKind,
        /// Credit, in centavos.
        pub credit_cents: Option<i32>,
        /// Free tickets.
        pub free_tickets: Option<i32>,
        /// Discount on the next batch.
        pub discount_percent: Option<i32>,
        /// Note of the admin.
        pub description: Option<String>,
        /// Uses allowed (none: unlimited).
        pub max_redemptions: Option<i32>,
        /// Uses so far.
        pub redemptions_count: i32,
        /// Only organizations created after the code.
        pub new_organizations_only: bool,
        /// Start.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub starts_at: Option<OffsetDateTime>,
        /// Expiry.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub expires_at: Option<OffsetDateTime>,
        /// Switched off.
        pub disabled: bool,
        /// Creation time.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// `POST /api/admin/promo-codes`.
    pub struct PromoCodeBody {
        /// Code (4–32 letters, digits, `-` or `_`); generated when empty.
        pub code: Option<String>,
        /// What it gives.
        pub kind: PromoCodeKind,
        /// Credit in centavos (kind `credit`).
        pub credit_cents: Option<i32>,
        /// Free tickets (kind `free_tickets`).
        pub free_tickets: Option<i32>,
        /// Discount (kind `discount`).
        pub discount_percent: Option<i32>,
        /// Note.
        pub description: Option<String>,
        /// Uses allowed.
        pub max_redemptions: Option<i32>,
        /// Only new organizations.
        pub new_organizations_only: bool,
        /// Start.
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub starts_at: Option<OffsetDateTime>,
        /// Expiry.
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub expires_at: Option<OffsetDateTime>,
    }

    /// `PUT /api/admin/promo-codes/{id}`: what can change after a code is out.
    pub struct PromoCodeUpdateBody {
        /// Note.
        pub description: Option<String>,
        /// Uses allowed.
        pub max_redemptions: Option<i32>,
        /// Expiry.
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub expires_at: Option<OffsetDateTime>,
        /// Switched off.
        pub disabled: bool,
    }

    /// One use of a promo code.
    pub struct PromoRedemptionDto {
        /// Organization.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub organization_id: Uuid,
        /// Its name.
        pub organization_name: String,
        /// Who typed it.
        pub redeemed_by: Option<String>,
        /// When.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub redeemed_at: OffsetDateTime,
        /// For a discount: when a batch used it.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub applied_at: Option<OffsetDateTime>,
    }

    /// `POST /api/account/redeem`.
    pub struct RedeemBody {
        /// The code as typed.
        pub code: String,
    }

    /// What a redeemed code gave.
    pub struct RedeemResultDto {
        /// Kind.
        pub kind: PromoCodeKind,
        /// Credit added, in centavos.
        pub credit_cents: Option<i32>,
        /// Free tickets added.
        pub free_tickets: Option<i32>,
        /// Discount waiting for the next batch.
        pub discount_percent: Option<i32>,
    }

    /// One movement of an organization's credit.
    pub struct CreditEntryDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Amount (negative when spent), in centavos.
        pub amount_cents: i32,
        /// Why.
        pub reason: CreditReason,
        /// Code, note of the admin...
        pub note: Option<String>,
        /// When.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// A discount code waiting for the next batch.
    pub struct PendingDiscountDto {
        /// The code.
        pub code: String,
        /// Discount.
        pub discount_percent: i32,
    }

    /// `GET /api/account/credits`.
    pub struct CreditsDto {
        /// Balance, in centavos.
        pub balance_cents: i32,
        /// Movements, newest first.
        pub entries: Vec<CreditEntryDto>,
        /// Discount waiting for the next batch.
        pub pending_discount: Option<PendingDiscountDto>,
    }

    /// `POST /api/admin/organizations/{id}/credits`.
    pub struct CreditAdjustBody {
        /// Amount (negative to remove), in centavos.
        pub amount_cents: i32,
        /// Why (shown to the organizer).
        pub note: Option<String>,
    }

    /// `POST /api/events/{id}/batches/quote`: what a batch would cost now, step by step.
    pub struct BatchQuoteDto {
        /// Tickets.
        pub quantity: i32,
        /// Of which free.
        pub free_tickets: i32,
        /// Price of the table (after free tickets, with the minimum), in centavos.
        pub list_price_cents: i32,
        /// Promotion applied.
        pub promotion: Option<ActivePromotionDto>,
        /// Discount code applied.
        pub discount_code: Option<PendingDiscountDto>,
        /// Discount of the promotion or the code, in centavos.
        pub discount_cents: i32,
        /// Credit used, in centavos.
        pub credit_cents: i32,
        /// What remains to pay, in centavos.
        pub total_cents: i32,
        /// Credit before this batch.
        pub credit_balance_cents: i32,
    }

    /// One e-mail of the log (ADR 0041).
    pub struct MailLogDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub id: i64,
        /// What it was.
        pub kind: String,
        /// Recipient (kept 30 days).
        pub to: Option<String>,
        /// Subject.
        pub subject: Option<String>,
        /// Delivery status.
        pub status: MailStatus,
        /// Provider's id.
        pub provider_id: Option<String>,
        /// Provider's refusal.
        pub error: Option<String>,
        /// When.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// Last status change.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub updated_at: OffsetDateTime,
    }

    /// `GET /api/admin/emails`.
    pub struct MailLogPageDto {
        /// This page.
        pub items: Vec<MailLogDto>,
        /// Matching rows.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub total: i64,
        /// Page (from 1).
        pub page: i32,
        /// Rows per page.
        pub per_page: i32,
    }

    /// A count by key.
    pub struct CountDto {
        /// Status or kind.
        pub key: String,
        /// Last 24 hours.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub day: i64,
        /// Last 7 days.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub week: i64,
    }

    /// E-mails of one day.
    pub struct MailDayDto {
        /// `2026-10-09` (UTC).
        pub date: String,
        /// Handed to the provider.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sent: i64,
        /// Refused or failed.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub failed: i64,
    }

    /// `GET /api/admin/emails/summary`.
    pub struct MailSummaryDto {
        /// `resend`, `log` (development) or `memory` (tests).
        pub provider: String,
        /// Sender.
        pub from: Option<String>,
        /// Delivery webhook configured (delivered/bounced statuses).
        pub webhook: bool,
        /// Daily quota (none: unlimited).
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub daily_limit: Option<i64>,
        /// Counted against it in the last 24 hours.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub used_today: i64,
        /// Of which codes for new addresses.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub signups_today: i64,
        /// Counts by status.
        pub by_status: Vec<CountDto>,
        /// Counts by kind.
        pub by_kind: Vec<CountDto>,
        /// The last 14 days.
        pub days: Vec<MailDayDto>,
    }

    /// A flagged image (ADR 0042).
    pub struct ModerationFlagDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// The art.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub art_id: Uuid,
        /// Organization.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub organization_id: Uuid,
        /// Its name.
        pub organization_name: String,
        /// Event; `null` for the organization's logo (ADR 0064).
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub event_id: Option<Uuid>,
        /// Its name.
        pub event_name: Option<String>,
        /// Uploader.
        pub uploaded_by: Option<String>,
        /// `adult`, `violence`, `racy`, `manual`...
        pub reasons: Vec<String>,
        /// Classifier likelihoods (0–5).
        #[cfg_attr(feature = "ts", ts(type = "Record<string, unknown>"))]
        pub details: serde_json::Value,
        /// 0–1.
        pub score: f32,
        /// Automatic or by an admin.
        pub source: String,
        /// Review status.
        pub status: ModerationStatus,
        /// Note of the reviewer.
        pub resolution_note: Option<String>,
        /// Reviewer.
        pub resolved_by: Option<String>,
        /// Review time.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub resolved_at: Option<OffsetDateTime>,
        /// Flag time.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// Width.
        pub width_px: i32,
        /// Height.
        pub height_px: i32,
    }

    /// A recent upload, for manual review.
    pub struct RecentArtDto {
        /// The art.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub art_id: Uuid,
        /// Organization.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub organization_id: Uuid,
        /// Its name.
        pub organization_name: String,
        /// Event; `null` for the organization's logo (ADR 0064).
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub event_id: Option<Uuid>,
        /// Its name.
        pub event_name: Option<String>,
        /// Moderation of the image.
        pub moderation: String,
        /// Upload time.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// `GET /api/admin/moderation/summary`.
    pub struct ModerationSummaryDto {
        /// Flags waiting for a decision.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub open: i64,
        /// Classifier configured.
        pub classifier: bool,
        /// Classifications today.
        pub used_today: i32,
        /// Allowed per day.
        pub daily_limit: i32,
    }

    /// `POST /api/admin/moderation/{id}/resolve`.
    pub struct ModerationResolveBody {
        /// `approve` or `reject`.
        pub action: ModerationAction,
        /// Note (shown to the organizer when rejecting).
        pub note: Option<String>,
        /// Notify the organization.
        pub notify: bool,
        /// Also suspend the organization.
        pub suspend: bool,
    }

    /// `POST /api/admin/moderation/arts/{id}/flag`.
    pub struct ModerationFlagBody {
        /// Why.
        pub note: Option<String>,
    }

    /// One service on the status page (ADR 0043).
    pub struct StatusComponentDto {
        /// `api`, `database`, `files`, `email`, `payments`.
        pub key: String,
        /// State.
        pub status: ServiceStatus,
    }

    /// One update of an incident.
    pub struct IncidentUpdateDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Status after it.
        pub status: IncidentStatus,
        /// Text.
        pub body: String,
        /// When.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// An incident or planned maintenance.
    pub struct IncidentDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Incident or maintenance.
        pub kind: IncidentKind,
        /// Title.
        pub title: String,
        /// Impact.
        pub impact: IncidentImpact,
        /// Status.
        pub status: IncidentStatus,
        /// Parts of the service affected.
        pub components: Vec<String>,
        /// Planned start (maintenance).
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub scheduled_for: Option<OffsetDateTime>,
        /// Planned end (maintenance).
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub scheduled_until: Option<OffsetDateTime>,
        /// Start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub started_at: OffsetDateTime,
        /// End.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub resolved_at: Option<OffsetDateTime>,
        /// Timeline, newest first.
        pub updates: Vec<IncidentUpdateDto>,
    }

    /// `GET /api/status` (no login).
    pub struct StatusDto {
        /// Overall state.
        pub status: ServiceStatus,
        /// Version of the API that answered (ADR 0049).
        pub version: String,
        /// When the server checked.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub checked_at: OffsetDateTime,
        /// Services.
        pub components: Vec<StatusComponentDto>,
        /// Maintenance mode.
        pub maintenance: MaintenanceDto,
        /// Open incidents and planned maintenance.
        pub active: Vec<IncidentDto>,
        /// Resolved in the last 90 days.
        pub recent: Vec<IncidentDto>,
    }

    /// `POST /api/admin/incidents` and `PUT /api/admin/incidents/{id}`.
    pub struct IncidentBody {
        /// Incident or maintenance.
        pub kind: IncidentKind,
        /// Title.
        pub title: String,
        /// Impact.
        pub impact: IncidentImpact,
        /// Parts affected.
        pub components: Vec<String>,
        /// Planned start.
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub scheduled_for: Option<OffsetDateTime>,
        /// Planned end.
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub scheduled_until: Option<OffsetDateTime>,
        /// First update (create only).
        pub message: Option<String>,
        /// Status (create only).
        pub status: Option<IncidentStatus>,
    }

    /// `POST /api/admin/incidents/{id}/updates`.
    pub struct IncidentUpdateBody {
        /// New status.
        pub status: IncidentStatus,
        /// Text.
        pub body: String,
    }

    /// `GET /api/admin/audit`.
    pub struct AuditPageDto {
        /// This page.
        pub items: Vec<AuditEntryDto>,
        /// Matching rows.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub total: i64,
        /// Page (from 1).
        pub page: i32,
        /// Rows per page.
        pub per_page: i32,
    }
}

dto_enum! {
    /// Maintenance mode (ADR 0037).
    pub enum MaintenanceMode {
        /// Normal.
        Off,
        /// Organizers read but cannot change anything.
        ReadOnly,
        /// Only admins get in.
        Full,
    }

    /// Tone of an announcement.
    pub enum AnnouncementLevel {
        /// Neutral.
        Info,
        /// Good news.
        Success,
        /// Attention.
        Warning,
        /// Urgent.
        Critical,
    }

    /// Where an announcement shows.
    pub enum AnnouncementDisplay {
        /// The bell only.
        Notification,
        /// Also a dialog when the panel opens.
        Modal,
    }

    /// Derived status of an announcement.
    pub enum AnnouncementStatus {
        /// Not published.
        Draft,
        /// Published, starts later.
        Scheduled,
        /// Showing.
        Active,
        /// Past its end.
        Ended,
        /// Taken down.
        Archived,
    }

    /// What a notification is about.
    /// An expense or other income.
    pub enum LedgerKind {
        /// Money spent.
        Expense,
        /// Money received outside ticket sales.
        Income,
    }

    /// How a table is drawn on the map.
    pub enum TableShape {
        /// Round table, seats around it.
        Round,
        /// Long table, seats on both sides.
        Rect,
    }

    /// What a team member takes care of on an event (ADR 0055).
    pub enum TeamArea {
        /// Everything but deleting, archiving or duplicating the event.
        Manage,
        /// What sellers hand over and give back.
        Money,
        /// Sellers, ranges, seller links, files, digital tickets and voids.
        Delivery,
        /// The ticket design.
        Art,
        /// Door links and phones.
        Door,
    }

    pub enum NotificationKind {
        /// An image of the user was refused by an admin.
        ArtRejected,
        /// An image under review was approved.
        ArtApproved,
        /// Credit added to the organization.
        CreditsGranted,
        /// Free tickets added.
        FreeTicketsGranted,
        /// A discount waits for the next batch.
        DiscountGranted,
        /// Prices will change.
        PriceChange,
        /// The user was added to an event's team (ADR 0055).
        TeamAdded,
        /// An event the user works on was postponed (ADR 0065).
        EventPostponed,
        /// An event the user works on was canceled (ADR 0065).
        EventCanceled,
        /// A referral earned credit (ADR 0076).
        ReferralRewarded,
    }

    /// What a promo code gives.
    pub enum PromoCodeKind {
        /// Credit in reais.
        Credit,
        /// Free tickets.
        FreeTickets,
        /// A discount on the next batch.
        Discount,
    }

    /// Why credit moved.
    pub enum CreditReason {
        /// A promo code.
        PromoCode,
        /// An admin.
        AdminAdjustment,
        /// Spent on a batch.
        BatchPayment,
        /// Back from a canceled batch.
        BatchCancel,
        /// Back from a refunded batch.
        BatchRefund,
        /// A referral's reward (ADR 0076).
        Referral,
        /// A referral's reward taken back (its batch was refunded).
        ReferralRevoked,
    }

    /// Delivery status of an e-mail.
    pub enum MailStatus {
        /// Being handed to the provider.
        Sending,
        /// Accepted by the provider.
        Sent,
        /// The provider refused or could not be reached.
        Failed,
        /// Not sent: daily quota.
        Quota,
        /// Delivered to the mailbox (webhook).
        Delivered,
        /// Delivery delayed (webhook).
        DeliveryDelayed,
        /// Bounced (webhook).
        Bounced,
        /// Marked as spam (webhook).
        Complained,
    }

    /// Review of a flagged image.
    pub enum ModerationStatus {
        /// Waiting for an admin.
        Open,
        /// Allowed.
        Approved,
        /// Refused: the image cannot be printed.
        Rejected,
    }

    /// Decision on a flagged image.
    pub enum ModerationAction {
        /// Allow.
        Approve,
        /// Refuse.
        Reject,
    }

    /// State of a service.
    pub enum ServiceStatus {
        /// Working.
        Operational,
        /// Slow or partly failing.
        Degraded,
        /// Not working.
        Down,
        /// Under maintenance.
        Maintenance,
    }

    /// Incident or planned maintenance.
    pub enum IncidentKind {
        /// Something broke.
        Incident,
        /// Planned work.
        Maintenance,
    }

    /// How bad.
    pub enum IncidentImpact {
        /// No visible impact.
        None,
        /// Some people notice.
        Minor,
        /// Many people affected.
        Major,
        /// The service is down.
        Critical,
    }

    /// Progress of an incident.
    pub enum IncidentStatus {
        /// Planned.
        Scheduled,
        /// Looking into it.
        Investigating,
        /// Cause found.
        Identified,
        /// Fixed, watching.
        Monitoring,
        /// Over.
        Resolved,
    }
}

db_enum!(MaintenanceMode { Off => "off", ReadOnly => "read_only", Full => "full" });
db_enum!(AnnouncementLevel { Info => "info", Success => "success", Warning => "warning", Critical => "critical" });
db_enum!(AnnouncementDisplay { Notification => "notification", Modal => "modal" });
db_enum!(NotificationKind {
    ArtRejected => "art_rejected",
    ArtApproved => "art_approved",
    CreditsGranted => "credits_granted",
    FreeTicketsGranted => "free_tickets_granted",
    DiscountGranted => "discount_granted",
    PriceChange => "price_change",
    TeamAdded => "team_added",
    EventPostponed => "event_postponed",
    EventCanceled => "event_canceled",
    ReferralRewarded => "referral_rewarded",
});
db_enum!(LedgerKind { Expense => "expense", Income => "income" });
db_enum!(TableShape { Round => "round", Rect => "rect" });
db_enum!(TeamArea { Manage => "manage", Money => "money", Delivery => "delivery", Art => "art", Door => "door" });
db_enum!(PromoCodeKind { Credit => "credit", FreeTickets => "free_tickets", Discount => "discount" });
db_enum!(CreditReason {
    PromoCode => "promo_code",
    AdminAdjustment => "admin_adjustment",
    BatchPayment => "batch_payment",
    BatchCancel => "batch_cancel",
    BatchRefund => "batch_refund",
    Referral => "referral",
    ReferralRevoked => "referral_revoked",
});
db_enum!(MailStatus {
    Sending => "sending",
    Sent => "sent",
    Failed => "failed",
    Quota => "quota",
    Delivered => "delivered",
    DeliveryDelayed => "delivery_delayed",
    Bounced => "bounced",
    Complained => "complained",
});
db_enum!(ModerationStatus { Open => "open", Approved => "approved", Rejected => "rejected" });
db_enum!(IncidentKind { Incident => "incident", Maintenance => "maintenance" });
db_enum!(IncidentImpact { None => "none", Minor => "minor", Major => "major", Critical => "critical" });
db_enum!(IncidentStatus {
    Scheduled => "scheduled",
    Investigating => "investigating",
    Identified => "identified",
    Monitoring => "monitoring",
    Resolved => "resolved",
});

// Door features (ADRs 0067–0071) ------------------------------------------------------------

dto! {
    /// Another open door of the event, as a phone sees it (ADR 0068).
    pub struct DoorRouteDto {
        /// The link's label, e.g. "Porta VIP".
        pub label: String,
        /// Categories it admits; empty: every ticket.
        #[cfg_attr(feature = "ts", ts(type = "string[]"))]
        pub category_ids: Vec<Uuid>,
    }

    /// `PUT /api/door-accesses/{id}/categories`.
    pub struct DoorAccessCategoriesBody {
        /// Categories the door admits; empty: every ticket.
        #[cfg_attr(feature = "ts", ts(type = "string[]"))]
        pub category_ids: Vec<Uuid>,
    }

    /// A guest, as the door phones keep it (ADR 0070).
    pub struct DoorGuestDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// People besides the guest (0–20).
        pub companions: i16,
        /// Note for the door, e.g. "camarim".
        pub note: Option<String>,
        /// Category, shown in its colour.
        pub category: Option<DoorCategoryTagDto>,
    }

    /// An arrival recorded by a door phone (or its undo), for every phone.
    pub struct DoorGuestArrivalDto {
        /// Generated on the phone.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// The guest.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub guest_id: Uuid,
        /// How many people came in (the guest and companions).
        pub people: i16,
        /// Unix milliseconds (phone clock corrected by the server offset).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub at_unix_ms: i64,
        /// Phone that recorded it.
        pub device_name: String,
        /// Undone by mistake on that phone.
        pub undone: bool,
    }

    /// One arrival uploaded by a phone; uploaded again when undone.
    pub struct DoorGuestUpload {
        /// Generated on the phone (uploads are idempotent).
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// The guest.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub guest_id: Uuid,
        /// People who came in (1–21).
        pub people: i16,
        /// Unix milliseconds (phone clock corrected by the server offset).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub arrived_at_ms: i64,
        /// When it was undone (on the same phone, within 2 minutes), Unix milliseconds.
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub undone_at_ms: Option<i64>,
    }

    /// `POST /api/door/guests`.
    pub struct DoorGuestsBody {
        /// Up to 500 arrivals.
        pub arrivals: Vec<DoorGuestUpload>,
    }

    /// `POST /api/door/guests` response, in request order.
    pub struct DoorGuestsResponse {
        /// Per arrival: kept, or dropped because the guest left the list.
        pub results: Vec<DoorGuestResult>,
    }

    /// Server view of an uploaded arrival.
    pub struct DoorGuestResult {
        /// Arrival id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// `false`: the guest was removed from the list meanwhile (nothing to send again).
        pub kept: bool,
    }

    /// `POST /api/events/{id}/guests`, `PUT /api/guests/{id}`.
    pub struct GuestBody {
        /// Name (1–80 characters).
        pub name: String,
        /// People besides the guest (0–20).
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub companions: Option<i16>,
        /// Note for the door (up to 120 characters).
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub note: Option<String>,
        /// Category of the event.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional, as = "Option<String>"))]
        pub category_id: Option<Uuid>,
    }

    /// `POST /api/events/{id}/guests/bulk`: names pasted one per line.
    pub struct GuestBulkBody {
        /// Up to 500 guests.
        pub guests: Vec<GuestBody>,
    }

    /// When a guest arrived (the first arrival that was not undone).
    pub struct GuestArrivalDto {
        /// When.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub at: OffsetDateTime,
        /// Which phone.
        pub device_name: String,
        /// People in, across every arrival (at most the guest and companions).
        pub people: i32,
    }

    /// A guest on the list (ADR 0070).
    pub struct GuestDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// People besides the guest.
        pub companions: i16,
        /// Note.
        pub note: Option<String>,
        /// Category.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub category_id: Option<Uuid>,
        /// Arrival, once they came in.
        pub arrival: Option<GuestArrivalDto>,
        /// Added at.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// `GET /api/events/{id}/door/live` (ADR 0071): the door right now.
    pub struct DoorLiveDto {
        /// Paid tickets.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub issued: i64,
        /// Paid tickets not returned unsold nor lost (what may still come in).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sold: i64,
        /// Tickets that entered.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
        /// First and last entry of the night.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub first_entry_at: Option<OffsetDateTime>,
        /// Last entry.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub last_entry_at: Option<OffsetDateTime>,
        /// Entries per 5 minutes over the last hour, oldest first (12 buckets).
        pub timeline: Vec<DoorLiveBucketDto>,
        /// Entries per door link.
        pub doors: Vec<DoorLiveDoorDto>,
        /// Every phone, with how it is doing.
        pub devices: Vec<DoorLiveDeviceDto>,
        /// Entries per category; empty without categories.
        pub categories: Vec<DoorLiveCategoryDto>,
        /// What the door stopped or let through by exception.
        pub refusals: DoorLiveRefusalsDto,
        /// The guest list (ADR 0070).
        pub guests: DoorLiveGuestsDto,
        /// Sales at the door (ADR 0069).
        pub box_office: DoorLiveBoxOfficeDto,
        /// Exit and return (ADR 0083); `null` when the event does not allow it and nobody went out.
        pub reentry: Option<DoorLiveReentryDto>,
        /// Entries per day of an event of several days (ADR 0091); empty for one day.
        #[serde(default)]
        pub days: Vec<DoorLiveDayDto>,
        /// The day the door is on now (1 for the first); `null` for an event of one day.
        #[serde(default)]
        pub today: Option<u8>,
        /// Uses of each checkpoint (ADR 0092).
        #[serde(default)]
        pub checkpoints: Vec<DoorLiveCheckpointDto>,
        /// Server clock.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub generated_at: OffsetDateTime,
    }

    /// Who is inside now and who went out (ADR 0083).
    pub struct DoorLiveReentryDto {
        /// Whether the event lets a ticket that went out come back.
        pub allowed: bool,
        /// Tickets inside now: entered and not out.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub inside: i64,
        /// Tickets out now, with the right to come back.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub out: i64,
        /// Exits read.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub exits: i64,
        /// Returns let in.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub returns: i64,
    }

    /// Entries in a 5-minute window.
    pub struct DoorLiveBucketDto {
        /// Window start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub start: OffsetDateTime,
        /// First entries in it.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
    }

    /// One door link.
    pub struct DoorLiveDoorDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Label.
        pub label: String,
        /// Category names it admits; empty: every ticket.
        pub categories: Vec<String>,
        /// Revoked or expired.
        pub closed: bool,
        /// First entries recorded by its phones.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
    }

    /// One phone.
    pub struct DoorLiveDeviceDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// Its door link's label.
        pub door: String,
        /// First entries it recorded.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
        /// Every scan received from it.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub scans: i64,
        /// Last contact with the server.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub last_seen_at: Option<OffsetDateTime>,
        /// Last manifest downloaded.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub last_sync_at: Option<OffsetDateTime>,
        /// Still to send at its last sync (`null`: not reported).
        pub pending_scans: Option<i32>,
        /// Rehearsal finished (ADR 0067).
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub rehearsed_at: Option<OffsetDateTime>,
        /// Disconnected by the organizer (or its link was).
        pub revoked: bool,
    }

    /// Entries of one category.
    pub struct DoorLiveCategoryDto {
        /// Name; `null`: numbers without a category.
        pub name: Option<String>,
        /// Band colour.
        pub color: Option<String>,
        /// Paid tickets not returned unsold nor lost.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sold: i64,
        /// Entries.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
    }

    /// Readings that did not let anyone in, and exceptions.
    pub struct DoorLiveRefusalsDto {
        /// Copies stopped (locally or by the online confirmation).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub blocked_copies: i64,
        /// Copies that entered through phones offline (found on sync).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub offline_duplicates: i64,
        /// Forged, damaged or foreign QR codes.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub invalid: i64,
        /// Tickets of other events.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub other_event: i64,
        /// Canceled tickets stopped at the door.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub voided: i64,
        /// Canceled tickets that entered (the phone did not know yet).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub void_entries: i64,
        /// Sent to another door (ADR 0068).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub wrong_door: i64,
        /// Let in anyway at a door that does not take their category.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub wrong_door_admitted: i64,
        /// Turned away on a day their category is not valid (ADR 0091).
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub wrong_day: i64,
        /// Let in anyway on a day their category is not valid.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub wrong_day_admitted: i64,
    }

    /// Entries of one day (ADR 0091).
    pub struct DoorLiveDayDto {
        /// 1 for the first day.
        pub position: u8,
        /// Start of the day, with the event's offset.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// Tickets that entered on that day.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
    }

    /// One checkpoint at the door (ADR 0092).
    pub struct DoorLiveCheckpointDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// One use per day (else one in the whole event).
        pub per_day: bool,
        /// Sold tickets with the right to it.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entitled: i64,
        /// Uses in the whole event (first uses of each ticket and book).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub used: i64,
        /// Uses today (an event of several days) or `null`.
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub used_today: Option<i64>,
        /// Second tries with a ticket that already used it.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub repeats: i64,
        /// Tickets without the right turned away.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub not_entitled: i64,
        /// Handed over anyway (no right, or a day it is not valid).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub exceptions: i64,
        /// Open links of the checkpoint.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub links: i64,
    }

    /// A checkpoint (ADR 0092), as the panel manages it.
    pub struct CheckpointDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name ("Janta").
        pub name: String,
        /// What to hand over ("Entregar o prato").
        pub instruction: Option<String>,
        /// One use per day the ticket is valid; otherwise one use in the whole event.
        pub per_day: bool,
        /// Categories entitled to it; empty: every ticket.
        #[cfg_attr(feature = "ts", ts(type = "string[]"))]
        pub category_ids: Vec<Uuid>,
        /// Uses recorded so far.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub uses: i64,
        /// Open links that read it.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub links: i64,
    }

    /// `POST /api/events/{id}/checkpoints`, `PUT /api/checkpoints/{id}`.
    pub struct CheckpointBody {
        /// Name (1–30 characters).
        pub name: String,
        /// What to hand over (up to 60 characters); blank: none.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional = nullable))]
        pub instruction: Option<String>,
        /// One use per day the ticket is valid; otherwise one use in the whole event.
        pub per_day: bool,
        /// Categories entitled to it; empty: every ticket.
        #[cfg_attr(feature = "ts", ts(as = "Vec<String>"))]
        pub category_ids: Vec<Uuid>,
    }

    /// The guest list at the door.
    pub struct DoorLiveGuestsDto {
        /// Names on the list.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub guests: i64,
        /// People on the list (guests and companions).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub people: i64,
        /// Names that arrived.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub arrived_guests: i64,
        /// People who came in.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub arrived_people: i64,
    }

    /// Box office sales: box office numbers that entered.
    pub struct DoorLiveBoxOfficeDto {
        /// Whether any seller is the box office.
        pub enabled: bool,
        /// Tickets sold at the door.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sold: i64,
        /// Their price (the category's, else the event's); `null` when one has no price.
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub amount_cents: Option<i64>,
        /// Courtesies among them (price 0).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub courtesies: i64,
    }
}

// Organization profile, postponing or canceling, the digital ticket's extras (ADRs 0064–0066) --

dto! {
    /// Postponement and cancellation of an event (ADR 0065).
    pub struct EventChangeDto {
        /// Start before the first postponement; `null` when never postponed (or moved back to
        /// the original date).
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub postponed_from_starts_at: Option<OffsetDateTime>,
        /// When it was last postponed.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub postponed_at: Option<OffsetDateTime>,
        /// Why it was postponed, as the organizer wrote it.
        pub postpone_reason: Option<String>,
        /// When it was canceled; `null` when it happens.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub canceled_at: Option<OffsetDateTime>,
        /// Why it was canceled.
        pub cancel_reason: Option<String>,
    }

    /// `POST /api/events/{id}/postpone`.
    pub struct PostponeEventBody {
        /// New start, with the event's offset.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// New end (after the start).
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
        /// Why (optional, up to 200 characters, one line).
        pub reason: Option<String>,
    }

    /// `POST /api/events/{id}/cancel`.
    pub struct CancelEventBody {
        /// Why (optional, up to 200 characters, one line).
        pub reason: Option<String>,
    }

    /// `GET /api/account/profile`: the organization's profile (ADR 0064).
    pub struct OrganizationProfileDto {
        /// Organization name (changed with `PUT /api/account`).
        pub organization_name: String,
        /// The logo, if any.
        pub logo: Option<ProfileLogoDto>,
        /// Brand colour (`#rrggbb`).
        pub brand_color: Option<String>,
        /// WhatsApp number, digits only with the country code (`5511999998888`).
        pub whatsapp: Option<String>,
        /// Public contact e-mail.
        pub contact_email: Option<String>,
        /// Site (`https://…`).
        pub website: Option<String>,
        /// Instagram handle, without the `@`.
        pub instagram: Option<String>,
        /// Venue of new events.
        pub default_venue: Option<String>,
        /// Address of new events.
        pub default_address: Option<String>,
        /// Ticket price of new events, in cents.
        pub default_ticket_price_cents: Option<i32>,
    }

    /// `PUT /api/account/profile`: every field at once (blank clears it).
    pub struct OrganizationProfileBody {
        /// `#rrggbb`.
        pub brand_color: Option<String>,
        /// Typed as people write it: `(11) 99999-8888`, `+55 11 99999-8888`…
        pub whatsapp: Option<String>,
        /// Public e-mail.
        pub contact_email: Option<String>,
        /// `exemplo.com.br` or `https://…`.
        pub website: Option<String>,
        /// `@perfil`, `perfil` or the profile's address.
        pub instagram: Option<String>,
        /// Up to 120 characters.
        pub default_venue: Option<String>,
        /// Up to 200 characters.
        pub default_address: Option<String>,
        /// Not negative.
        pub default_ticket_price_cents: Option<i32>,
    }

    /// The organization's logo and its review (moderated like the art, ADR 0042).
    pub struct ProfileLogoDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// `unchecked`, `clean`, `flagged`, `approved` or `rejected`.
        pub moderation: String,
        /// Public address of the image (`/api/logos/{id}`); `null` while it is under review or
        /// after it was refused.
        pub path: Option<String>,
    }

    /// A Pix key with who receives and the city (ADR 0085), as the BR Code needs them.
    pub struct PixAccountDto {
        /// Kind of key.
        pub key_type: PixKeyType,
        /// The key, normalized (CPF/CNPJ without punctuation, `+55…`, lowercase e-mail, EVP).
        pub key: String,
        /// Who receives, as the payer's bank shows it (up to 25 characters).
        pub name: String,
        /// City of who receives (up to 15 characters).
        pub city: String,
    }

    /// `PUT /api/account/pix`, `PUT /api/sellers/{id}/pix`.
    pub struct PixAccountBody {
        /// Kind of key.
        pub key_type: PixKeyType,
        /// As typed: `123.456.789-09`, `(11) 99999-8888`…
        pub key: String,
        /// Who receives (1–25 characters).
        pub name: String,
        /// City (1–15 characters).
        pub city: String,
    }

    /// `GET /api/events/{id}/pix`: how buyers pay by Pix and which numbers were paid.
    pub struct EventPixDto {
        /// Who the Pix pays.
        pub receiver: PixReceiver,
        /// The organization's key, when it has one (Minha organização).
        pub organization: Option<PixAccountDto>,
        /// The event's sellers and their own keys.
        pub sellers: Vec<SellerPixDto>,
        /// Numbers someone may pay: sold, sent as digital tickets or already paid.
        pub numbers: Vec<PixNumberDto>,
    }

    /// A seller and their Pix key.
    pub struct SellerPixDto {
        /// Seller id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub seller_id: Uuid,
        /// Name.
        pub name: String,
        /// Their own key, if any.
        pub account: Option<PixAccountDto>,
    }

    /// A number that may be paid by Pix.
    pub struct PixNumberDto {
        /// Ticket number.
        pub number: i32,
        /// Its price (category's, else the event's); `null` without one.
        pub amount_cents: Option<i32>,
        /// Seller who holds it.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub seller_id: Option<Uuid>,
        /// Seller's name.
        pub seller: Option<String>,
        /// Buyer or holder, as written down.
        pub buyer: Option<String>,
        /// Whose key its Pix pays now.
        pub payee: PixPayee,
        /// Its Pix was seen arriving.
        pub receipt: Option<PixReceiptDto>,
    }

    /// Someone saw a number's Pix arrive.
    pub struct PixReceiptDto {
        /// Who received it.
        pub received_by: PixPayee,
        /// Amount recorded.
        pub amount_cents: i32,
        /// When it was confirmed.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub confirmed_at: OffsetDateTime,
    }

    /// `PUT /api/events/{id}/pix-settings`.
    pub struct PixSettingsBody {
        /// Who the Pix pays.
        pub receiver: PixReceiver,
    }

    /// `POST /api/events/{id}/pix/receipts`: numbers whose Pix was seen arriving (or undone).
    pub struct PixReceiptsBody {
        /// Up to 500 numbers.
        pub numbers: Vec<i32>,
        /// Received (`true`) or not yet (`false`).
        pub paid: bool,
    }

    /// Who runs an event, as the public pages show it (ADR 0064).
    pub struct PublicOrganizationDto {
        /// Name.
        pub name: String,
        /// Logo (`/api/logos/{id}`, an image of the API), when there is one and it may be shown.
        pub logo_path: Option<String>,
        /// Brand colour (`#rrggbb`).
        pub brand_color: Option<String>,
        /// WhatsApp, digits with the country code: the "Falar com a organização" button.
        pub whatsapp: Option<String>,
        /// Public e-mail.
        pub email: Option<String>,
        /// Site.
        pub website: Option<String>,
        /// Instagram handle.
        pub instagram: Option<String>,
    }

    /// The room on the digital ticket (ADR 0066): every table, without who sits where.
    pub struct PassTableMapDto {
        /// Tables of the event.
        pub tables: Vec<PassTableDto>,
        /// The holder's table (names are unique in an event).
        pub table: String,
        /// The holder's seat.
        pub seat: i16,
    }

    /// A table on the ticket's map.
    pub struct PassTableDto {
        /// Name.
        pub name: String,
        /// Seats.
        pub seats: i16,
        /// Drawing.
        pub shape: TableShape,
        /// Centre (0–1 of the width).
        pub x: f32,
        /// Centre (0–1 of the height).
        pub y: f32,
    }
}

// Check a ticket before buying it (ADR 0075) ------------------------------------------------

dto! {
    /// `POST /api/verify` (no login): the text read from a ticket's QR.
    pub struct VerifyTicketBody {
        /// QR text, as read by the camera or pasted.
        pub text: String,
    }

    /// What the public check says. Never whether the ticket already entered, nor who has it.
    pub struct VerifyResultDto {
        /// The answer.
        pub verdict: VerifyVerdict,
        /// The ticket, when the QR is an authentic ticket of an event that allows the check.
        pub ticket: Option<VerifiedTicketDto>,
    }

    /// An authentic ticket, as printed.
    pub struct VerifiedTicketDto {
        /// The event.
        pub event: VerifiedEventDto,
        /// Who runs it: name, logo and contact (ADR 0064).
        pub organization: PublicOrganizationDto,
        /// Ticket number.
        pub number: i32,
        /// Number as printed.
        pub number_label: String,
        /// Text before the number on paper, e.g. "Nº ".
        pub number_prefix: String,
        /// Category (ADR 0056).
        pub category: Option<DoorCategoryTagDto>,
    }

    /// The event of a checked ticket.
    pub struct VerifiedEventDto {
        /// Name.
        pub name: String,
        /// Venue.
        pub venue: Option<String>,
        /// Street address.
        pub address: Option<String>,
        /// Start, with the event's offset.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// End.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
        /// Postponement and cancellation (ADR 0065).
        pub change: EventChangeDto,
        /// One of several dates (ADR 0077): the page says which session the ticket is for.
        pub in_series: bool,
        /// Tickets or consumption tokens (ADR 0084).
        pub kind: EventKind,
        /// The days of an event of several days (ADR 0091): the page says when the ticket is
        /// valid.
        #[serde(default)]
        pub days: Vec<EventDayDto>,
    }

    /// `GET|PUT /api/events/{id}/verify-settings`.
    pub struct VerifySettingsDto {
        /// Whether anyone with the ticket may check it on the site.
        pub public_verify: bool,
    }
}

dto_enum! {
    /// The answer of the public check.
    pub enum VerifyVerdict {
        /// Authentic, not canceled, the event is on.
        Valid,
        /// Authentic, but the event changed date.
        EventPostponed,
        /// Authentic, but the event already happened.
        EventOver,
        /// Authentic, but the event was canceled.
        EventCanceled,
        /// Authentic, but this number was canceled by the organizer.
        TicketCanceled,
        /// The organizer turned the public check off for this event.
        Private,
        /// Not a ticket we issued (or tampered with).
        NotOurs,
    }
}

// Refer and earn (ADR 0076) -----------------------------------------------------------------

dto! {
    /// `GET /api/referrals/{code}` (no login): who invites, and what a new account earns.
    pub struct ReferralInviteDto {
        /// The code, normalized.
        pub code: String,
        /// The referring organization's name; `null` while it is still an e-mail address (never
        /// shown on a public link).
        pub organization_name: Option<String>,
        /// Credit the new account earns on its first paid batch, in centavos.
        pub referred_cents: i32,
        /// Smallest first batch that counts, in centavos.
        pub min_batch_cents: i32,
    }

    /// `GET /api/account/referrals`: the organization's link and the people it referred.
    pub struct ReferralsDto {
        /// Whether the program is on.
        pub enabled: bool,
        /// The organization's code (`/i/<code>`).
        pub code: String,
        /// What the referrer earns per referral, in centavos.
        pub referrer_cents: i32,
        /// What the referred organization earns, in centavos.
        pub referred_cents: i32,
        /// Smallest first batch that counts, in centavos.
        pub min_batch_cents: i32,
        /// Rewards the referrer may earn in any 30 days.
        pub monthly_limit: i32,
        /// Credit earned by referring, revoked rewards left out, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub earned_cents: i64,
        /// People referred, newest first.
        pub referrals: Vec<ReferralDto>,
        /// The organization itself came through a referral.
        pub invited_by: Option<InvitedByDto>,
    }

    /// A referred account, as its referrer sees it (never the whole e-mail).
    pub struct ReferralDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Masked e-mail, e.g. `ma•••@gmail.com`.
        pub email_hint: String,
        /// Where it is.
        pub status: ReferralStatus,
        /// When the account was created.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// When the reward came.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub rewarded_at: Option<OffsetDateTime>,
        /// What the referrer earned, in centavos.
        pub earned_cents: i32,
        /// The monthly limit was reached: only the referred account earned.
        pub capped: bool,
    }

    /// The referral that brought the organization in.
    pub struct InvitedByDto {
        /// Who referred it; `null` if that account was deleted.
        pub organization_name: Option<String>,
        /// Where it is.
        pub status: ReferralStatus,
        /// Credit earned, or to earn on the first paid batch, in centavos.
        pub referred_cents: i32,
    }

    /// `GET|PUT /api/admin/referrals/settings`.
    pub struct ReferralSettingsDto {
        /// Whether new referrals are taken and rewards paid.
        pub enabled: bool,
        /// Credit for the referrer, in centavos (0–100000).
        pub referrer_cents: i32,
        /// Credit for the referred organization, in centavos (0–100000).
        pub referred_cents: i32,
        /// Rewards one referrer may earn in any 30 days (0–1000).
        pub monthly_limit: i32,
        /// Smallest batch, actually paid, that earns the reward, in centavos.
        pub min_batch_cents: i32,
    }

    /// `GET /api/admin/referrals`.
    pub struct AdminReferralsDto {
        /// The program's switches.
        pub settings: ReferralSettingsDto,
        /// Referrals by status.
        pub totals: ReferralTotalsDto,
        /// The latest referrals.
        pub referrals: Vec<AdminReferralDto>,
    }

    /// Sums of the program.
    pub struct ReferralTotalsDto {
        /// Waiting for the first paid batch.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub pending: i64,
        /// Rewarded.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub rewarded: i64,
        /// Revoked.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revoked: i64,
        /// Credit given and not revoked, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub credit_cents: i64,
    }

    /// A referral in the admin panel.
    pub struct AdminReferralDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Referrer; `null` once deleted.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub referrer_id: Option<Uuid>,
        /// Referrer's name.
        pub referrer_name: Option<String>,
        /// Referred organization; `null` once deleted.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub referred_id: Option<Uuid>,
        /// Referred organization's name.
        pub referred_name: Option<String>,
        /// Masked e-mail of the referred account.
        pub email_hint: String,
        /// Where it is.
        pub status: ReferralStatus,
        /// When the account was created.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// When the reward came.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub rewarded_at: Option<OffsetDateTime>,
        /// Credit given to the referrer, in centavos.
        pub referrer_cents: i32,
        /// Credit given to the referred organization, in centavos.
        pub referred_cents: i32,
        /// The referrer was over the monthly limit.
        pub referrer_capped: bool,
        /// When it was revoked.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub revoked_at: Option<OffsetDateTime>,
        /// Why: `batch_refunded` or `admin`.
        pub revoke_reason: Option<String>,
    }
}

dto_enum! {
    /// Where a referral is.
    pub enum ReferralStatus {
        /// The account exists; its first paid batch is awaited.
        Pending,
        /// Both sides got their credit.
        Rewarded,
        /// Taken back (refunded batch, or an admin).
        Revoked,
    }
}

db_enum!(ReferralStatus { Pending => "pending", Rewarded => "rewarded", Revoked => "revoked" });

// Several dates of one event (ADR 0077) and the checklist of what is missing (ADR 0078).
dto! {
    /// The series of dates an event is one of.
    pub struct EventSeriesRefDto {
        /// Series id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// The series' name.
        pub name: String,
        /// Dates in the series (all of them, also those the user cannot open).
        pub dates: i32,
        /// This date's place by start, from 1.
        pub position: i32,
    }

    /// `POST /api/events/{id}/dates`: another date with the same setup.
    pub struct NewDateBody {
        /// Start, with the event's offset.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// End.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
    }

    /// `PUT /api/series/{id}`: renames the series (and the dates that still carry its name).
    pub struct SeriesBody {
        /// New name.
        pub name: String,
    }

    /// `GET /api/series/{id}`: the dates side by side and the series' totals.
    pub struct SeriesDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// The organization that runs it.
        pub organization_name: String,
        /// Whether the user may rename the series and add or detach dates (the organization's
        /// own people).
        pub can_manage: bool,
        /// Opened by an admin outside their organization (support mode, ADR 0032).
        pub support_access: bool,
        /// The dates the user may open, earliest first.
        pub dates: Vec<SeriesDateDto>,
        /// Dates the user cannot open (on the team of some dates only).
        pub hidden_dates: i32,
        /// Sums of the dates shown.
        pub totals: SeriesNumbersDto,
        /// Sellers of the dates shown, added up by name.
        pub sellers: Vec<SeriesSellerDto>,
    }

    /// One date of a series and its numbers.
    pub struct SeriesDateDto {
        /// The event of that date.
        pub event: EventDto,
        /// Its numbers.
        pub numbers: SeriesNumbersDto,
    }

    /// What one date (or the whole series) issued, sold and took in, as the report counts it.
    #[derive(Default)]
    pub struct SeriesNumbersDto {
        /// Paid tickets.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub tickets: i64,
        /// Declared sold (paid − returned − lost; entries for a box office).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sold: i64,
        /// Entries at the door.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
        /// Sold × price, in centavos; `null` when a sold ticket has no price.
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub amount_due_cents: Option<i64>,
        /// Received from sellers, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub received_cents: i64,
        /// Paid for batches, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub cost_cents: i64,
        /// Amount due minus cost; `null` without an amount.
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub net_cents: Option<i64>,
    }

    /// A seller across the dates, matched by name.
    pub struct SeriesSellerDto {
        /// Name, as on the first date it appears.
        pub name: String,
        /// Dates the seller had numbers or handed over money on.
        pub dates: i32,
        /// Tickets handed to the seller.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub tickets: i64,
        /// Declared sold.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sold: i64,
        /// Amount due, in centavos; `null` when some date has no price.
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub amount_due_cents: Option<i64>,
        /// Received, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub received_cents: i64,
        /// Still owed, in centavos; `null` without an amount.
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub balance_cents: Option<i64>,
    }

    /// `GET /api/events/{id}/checklist`: what is missing before the event.
    pub struct ChecklistDto {
        /// Whether the checklist applies: the event has not ended and is neither archived nor
        /// canceled. When it does not, `items` is empty.
        pub applies: bool,
        /// Required items still missing (optional ones never count).
        pub missing: i32,
        /// Required items (done or not), the ones that do not apply aside.
        pub required: i32,
        /// Every item, in the order the work goes.
        pub items: Vec<ChecklistItemDto>,
    }

    /// One thing to have ready.
    pub struct ChecklistItemDto {
        /// What.
        pub key: ChecklistKey,
        /// Where it stands.
        pub state: ChecklistState,
        /// Optional items never count as missing.
        pub optional: bool,
        /// The team area that takes care of it; `null`: the organization's own people.
        pub area: Option<TeamArea>,
        /// Whether the user may do it (the panel offers the way only then).
        pub can_act: bool,
        /// How far, when it is made of parts (sellers with a link out of sellers with numbers).
        pub progress: Option<ChecklistProgressDto>,
        /// Why it is missing, when there is more to say.
        pub hint: Option<ChecklistHint>,
    }

    /// Done out of total.
    pub struct ChecklistProgressDto {
        /// Done.
        pub done: i32,
        /// Total.
        pub total: i32,
    }
}

dto_enum! {
    /// An item of the checklist.
    pub enum ChecklistKey {
        /// Venue and address.
        Details,
        /// A saved ticket design.
        Design,
        /// The images of the design are free to print (ADR 0042).
        Art,
        /// Categories (optional).
        Categories,
        /// A paid batch.
        Batch,
        /// Sellers with numbers (optional).
        Sellers,
        /// Every seller with numbers has a private link (ADR 0053).
        SellerLinks,
        /// Files generated or digital tickets sent.
        Delivery,
        /// An open door link.
        DoorLink,
        /// A phone rehearsed the door (ADR 0067).
        Rehearsal,
        /// The guest list (optional, ADR 0070).
        Guests,
        /// The public check is on (ADR 0075).
        PublicVerify,
        /// The organization's profile has a contact (ADR 0064).
        OrganizationContact,
        /// Every checkpoint has an open link (ADR 0092).
        CheckpointLinks,
    }

    /// Where an item stands.
    pub enum ChecklistState {
        /// Ready.
        Done,
        /// Still to do.
        Missing,
        /// Not done, and optional.
        Optional,
        /// Does not apply to this event (no images to review, no sellers).
        NotApplicable,
    }

    /// More about a missing item.
    pub enum ChecklistHint {
        /// The venue is empty.
        NoVenue,
        /// The address is empty.
        NoAddress,
        /// Neither.
        NoVenueNorAddress,
        /// An image is waiting for the review.
        ArtUnderReview,
        /// An image was refused.
        ArtRejected,
        /// No phone was registered at the door yet.
        NoDevices,
    }
}
