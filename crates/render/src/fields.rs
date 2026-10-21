//! Event details printed by text blocks through fields such as `{evento}` or `{data}`.
//!
//! The painel's live preview mirrors these rules (`apps/web/src/lib/ticket-fields.ts`); both
//! are tested against the same examples.

use time::PrimitiveDateTime;

use crate::texts::{FREE_PRICE, MONTHS, WEEKDAYS};

/// Every field a text block may use, without braces.
pub const FIELDS: &[&str] = &[
    "evento",
    "local",
    "data",
    "data_extenso",
    "semana",
    "dia",
    "mes",
    "mes_curto",
    "ano",
    "hora",
    "preco",
    "organizacao",
    "categoria",
    "dias",
];

/// What text blocks can print about the event, besides its name.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EventDetails {
    /// Venue.
    pub venue: Option<String>,
    /// Start, in the wall-clock time of the event's place.
    pub starts_at: Option<PrimitiveDateTime>,
    /// Ticket price in cents.
    pub price_cents: Option<i64>,
    /// Name of the organization that runs the event (ADR 0064).
    pub organization: Option<String>,
    /// The ticket's category (`{categoria}`, ADR 0084): the product of a consumption token.
    /// Known per ticket only; a ticket without one hides the block.
    pub category: Option<String>,
    /// Start of each day of an event of several days (`{dias}`, ADR 0091), in the wall-clock time
    /// of the event's place; empty for an event of one day.
    pub days: Vec<PrimitiveDateTime>,
}

/// `text` with its fields replaced. `None` when a field it uses has no value (an event without
/// venue or price), so a half-filled line such as "Local: " is never printed. Unknown names in
/// braces are printed as typed.
pub fn resolve(text: &str, event_name: &str, details: &EventDetails) -> Option<String> {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(open) = rest.find('{') {
        let (before, from_brace) = rest.split_at(open);
        out.push_str(before);
        let field = from_brace
            .get(1..)
            .and_then(|after| after.find('}').map(|close| (after, close)))
            .and_then(|(after, close)| {
                let name = after.get(..close)?;
                FIELDS.contains(&name).then_some((name, close))
            });
        if let Some((name, close)) = field {
            let value = value(name, event_name, details)?;
            if value.is_empty() {
                return None;
            }
            out.push_str(&value);
            // `{` + name + `}`.
            rest = from_brace.get(close + 2..).unwrap_or_default();
        } else {
            out.push('{');
            rest = from_brace.get(1..).unwrap_or_default();
        }
    }
    out.push_str(rest);
    Some(out)
}

fn value(name: &str, event_name: &str, details: &EventDetails) -> Option<String> {
    let date = || details.starts_at;
    let month = |date: PrimitiveDateTime| MONTHS.get(usize::from(u8::from(date.month()) - 1));
    let weekday = |date: PrimitiveDateTime| {
        WEEKDAYS.get(usize::from(date.weekday().number_days_from_monday()))
    };
    Some(match name {
        "evento" => event_name.trim().to_owned(),
        "local" => details
            .venue
            .as_deref()
            .unwrap_or_default()
            .trim()
            .to_owned(),
        "data" => date().map_or_else(String::new, |d| {
            format!("{:02}/{:02}/{}", d.day(), u8::from(d.month()), d.year())
        }),
        "data_extenso" => match date() {
            Some(d) => format!(
                "{}, {} de {} de {}",
                weekday(d)?,
                d.day(),
                month(d)?,
                d.year()
            ),
            None => String::new(),
        },
        "semana" => match date() {
            Some(d) => (*weekday(d)?).to_owned(),
            None => String::new(),
        },
        "dia" => date().map_or_else(String::new, |d| format!("{:02}", d.day())),
        "mes" => match date() {
            Some(d) => (*month(d)?).to_owned(),
            None => String::new(),
        },
        "mes_curto" => match date() {
            Some(d) => month(d)?.chars().take(3).collect(),
            None => String::new(),
        },
        "ano" => date().map_or_else(String::new, |d| d.year().to_string()),
        "hora" => date().map_or_else(String::new, |d| match d.minute() {
            0 => format!("{}h", d.hour()),
            minute => format!("{}h{minute:02}", d.hour()),
        }),
        "preco" => details.price_cents.map_or_else(String::new, money),
        "organizacao" => details
            .organization
            .as_deref()
            .unwrap_or_default()
            .trim()
            .to_owned(),
        "categoria" => details
            .category
            .as_deref()
            .unwrap_or_default()
            .trim()
            .to_owned(),
        // The days of the event; an event of one day prints its date.
        "dias" => {
            if details.days.is_empty() {
                date().map(|d| days_text(&[d])).unwrap_or_default()
            } else {
                days_text(&details.days)
            }
        }
        _ => return None,
    })
}

/// "a, b e c": a list as written in Portuguese.
fn join_list(items: &[String]) -> String {
    match items {
        [] => String::new(),
        [only] => only.clone(),
        [head @ .., last] => format!("{} e {last}", head.join(", ")),
    }
}

/// The days of one month of one year, for [`days_text`].
type MonthDays = (time::Month, Vec<u8>);

/// The days of an event: "21 e 22 de novembro de 2026", "30 de novembro e 1 de dezembro de 2026",
/// "31 de dezembro de 2026 e 1 de janeiro de 2027". Days in order; repeats print once.
pub(crate) fn days_text(days: &[PrimitiveDateTime]) -> String {
    let mut sorted: Vec<time::Date> = days.iter().map(|day| day.date()).collect();
    sorted.sort_unstable();
    sorted.dedup();
    let mut years: Vec<(i32, Vec<MonthDays>)> = Vec::new();
    for date in sorted {
        match years.last_mut() {
            Some((year, months)) if *year == date.year() => match months.last_mut() {
                Some((month, numbers)) if *month == date.month() => numbers.push(date.day()),
                _ => months.push((date.month(), vec![date.day()])),
            },
            _ => years.push((date.year(), vec![(date.month(), vec![date.day()])])),
        }
    }
    let year_parts: Vec<String> = years
        .iter()
        .map(|(year, months)| {
            let month_parts: Vec<String> = months
                .iter()
                .map(|(month, numbers)| {
                    let name = MONTHS
                        .get(usize::from(u8::from(*month) - 1))
                        .copied()
                        .unwrap_or_default();
                    let numbers: Vec<String> = numbers.iter().map(ToString::to_string).collect();
                    format!("{} de {name}", join_list(&numbers))
                })
                .collect();
            format!("{} de {year}", join_list(&month_parts))
        })
        .collect();
    join_list(&year_parts)
}

/// `R$ 1.234,50`; zero is [`FREE_PRICE`].
fn money(cents: i64) -> String {
    if cents == 0 {
        return FREE_PRICE.to_owned();
    }
    let reais = (cents / 100).unsigned_abs().to_string();
    let mut grouped = String::new();
    for (index, digit) in reais.chars().enumerate() {
        if index > 0 && (reais.len() - index).is_multiple_of(3) {
            grouped.push('.');
        }
        grouped.push(digit);
    }
    let sign = if cents < 0 { "-" } else { "" };
    format!("{sign}R$ {grouped},{:02}", (cents % 100).unsigned_abs())
}

#[cfg(test)]
mod tests {
    use time::macros::datetime;

    use super::*;

    fn details() -> EventDetails {
        EventDetails {
            venue: Some("Ginásio Municipal".to_owned()),
            starts_at: Some(datetime!(2026-03-14 21:00)),
            price_cents: Some(2_500),
            organization: Some(" Banda Os Vizinhos ".to_owned()),
            category: Some(" Pastel ".to_owned()),
            days: Vec::new(),
        }
    }

    #[test]
    fn replaces_every_field() {
        let cases = [
            ("{evento}", "Arraiá da Escola"),
            ("{local}", "Ginásio Municipal"),
            ("{data}", "14/03/2026"),
            ("{data_extenso}", "sábado, 14 de março de 2026"),
            ("{semana}", "sábado"),
            ("{dia}", "14"),
            ("{mes}", "março"),
            ("{mes_curto}", "mar"),
            ("{ano}", "2026"),
            ("{hora}", "21h"),
            ("{preco}", "R$ 25,00"),
            ("{dia}/{mes_curto} · {hora}", "14/mar · 21h"),
            ("{organizacao}", "Banda Os Vizinhos"),
            ("Realização: {organizacao}", "Realização: Banda Os Vizinhos"),
            ("{categoria}", "Pastel"),
            ("1 {categoria} · {preco}", "1 Pastel · R$ 25,00"),
            ("{dias}", "14 de março de 2026"),
        ];
        for (text, expected) in cases {
            assert_eq!(
                resolve(text, " Arraiá da Escola ", &details()).as_deref(),
                Some(expected),
                "{text}"
            );
        }
    }

    #[test]
    fn formats_minutes_days_and_prices() {
        let details = EventDetails {
            venue: None,
            starts_at: Some(datetime!(2026-01-05 09:30)),
            price_cents: Some(123_456_789),
            organization: None,
            category: None,
            days: Vec::new(),
        };
        assert_eq!(resolve("{hora}", "", &details).as_deref(), Some("9h30"));
        assert_eq!(resolve("{dia}", "", &details).as_deref(), Some("05"));
        assert_eq!(
            resolve("{data_extenso}", "", &details).as_deref(),
            Some("segunda-feira, 5 de janeiro de 2026")
        );
        assert_eq!(
            resolve("{preco}", "", &details).as_deref(),
            Some("R$ 1.234.567,89")
        );
        let free = EventDetails {
            price_cents: Some(0),
            ..details
        };
        assert_eq!(resolve("{preco}", "", &free).as_deref(), Some("Gratuito"));
    }

    #[test]
    fn prints_the_days_of_an_event() {
        let with = |days: Vec<PrimitiveDateTime>| EventDetails {
            starts_at: days.first().copied(),
            days,
            ..EventDetails::default()
        };
        let cases = [
            (
                vec![datetime!(2026-11-21 18:00), datetime!(2026-11-22 12:00)],
                "21 e 22 de novembro de 2026",
            ),
            (
                vec![
                    datetime!(2026-11-07 18:00),
                    datetime!(2026-11-14 18:00),
                    datetime!(2026-11-21 18:00),
                ],
                "7, 14 e 21 de novembro de 2026",
            ),
            (
                vec![datetime!(2026-11-30 20:00), datetime!(2026-12-01 20:00)],
                "30 de novembro e 1 de dezembro de 2026",
            ),
            (
                vec![datetime!(2026-12-31 20:00), datetime!(2027-01-01 20:00)],
                "31 de dezembro de 2026 e 1 de janeiro de 2027",
            ),
            // A night that goes past midnight is still one day.
            (
                vec![datetime!(2026-11-21 18:00), datetime!(2026-11-21 23:00)],
                "21 de novembro de 2026",
            ),
        ];
        for (days, expected) in cases {
            assert_eq!(
                resolve("{dias}", "", &with(days)).as_deref(),
                Some(expected)
            );
        }
        assert_eq!(resolve("{dias}", "", &EventDetails::default()), None);
    }

    #[test]
    fn hides_texts_with_empty_fields() {
        let empty = EventDetails::default();
        assert_eq!(resolve("Local: {local}", "Show", &empty), None);
        assert_eq!(resolve("{preco}", "Show", &empty), None);
        assert_eq!(resolve("{data} {hora}", "Show", &empty), None);
        assert_eq!(resolve("Realização: {organizacao}", "Show", &empty), None);
        assert_eq!(resolve("Ficha de {categoria}", "Show", &empty), None);
        assert_eq!(
            resolve("Entrada individual", "Show", &empty).as_deref(),
            Some("Entrada individual")
        );
    }

    #[test]
    fn keeps_unknown_or_broken_braces() {
        let text = "{nome} {evento} { {evento";
        assert_eq!(
            resolve(text, "Show", &details()).as_deref(),
            Some("{nome} Show { {evento")
        );
        assert_eq!(resolve("}{", "Show", &details()).as_deref(), Some("}{"));
    }
}
