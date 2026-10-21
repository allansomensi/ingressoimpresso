// Credentials (ADR 0111): badges of the staff, the press and the artists, four on an A4 with cut
// lines. Every value comes from /data.json and the QR codes from /qr/<n>.svg; user text is only
// displayed (CLAUDE.md invariant 5).
#let data = json("/data.json")
#let ink = rgb("#0e0d14")
#let muted = rgb("#5b5a6b")
#let rule = rgb("#c9c8d3")

#let badge-w = 100mm
#let badge-h = 140mm

#set page(paper: "a4", margin: (x: 5mm, y: 8.5mm))
#set text(font: "Lato", size: 9pt, fill: ink, lang: "pt")
#set par(leading: 0.45em)

#let badge(b) = {
  let accent = rgb(b.color)
  box(width: badge-w, height: badge-h, stroke: (paint: rule, thickness: 0.4pt, dash: "dashed"), clip: true, {
    // The event, small, on top.
    block(width: 100%, inset: (x: 7mm, top: 6mm, bottom: 2mm), {
      text(size: 8pt, weight: "bold", tracking: 0.08em, fill: muted, upper(data.event))
      if data.subtitle != "" {
        linebreak()
        text(size: 7.5pt, fill: muted, data.subtitle)
      }
    })
    // The role: what the doorkeeper reads from afar.
    block(width: 100%, fill: accent, inset: (x: 7mm, y: 3.5mm),
      align(center, text(font: "Anton", size: if b.role.len() > 14 { 20pt } else { 28pt }, fill: white,
        tracking: 0.04em, upper(b.role))))
    block(width: 100%, inset: (x: 7mm, top: 4mm), {
      align(center, {
        text(size: if b.name.len() > 26 { 13pt } else { 16pt }, weight: "bold", b.name)
        if b.organization != none {
          linebreak()
          text(size: 9pt, fill: muted, b.organization)
        }
      })
    })
    place(bottom + center, dy: -16mm, image(b.qr, width: 46mm))
    place(bottom + left, dx: 7mm, dy: -6mm, block(width: badge-w - 14mm, {
      grid(columns: (auto, 1fr), column-gutter: 3mm, align: (left + bottom, right + bottom),
        text(font: "Space Mono", size: 8pt, weight: "bold", b.code),
        text(size: 7pt, fill: muted, b.areas))
      v(1mm)
      text(size: 6.5pt, fill: muted, data.footer)
    }))
  })
}

#let pages = range(0, data.badges.len(), step: 4).map(start => data.badges.slice(start, calc.min(start + 4, data.badges.len())))
#for (page-index, items) in pages.enumerate() {
  if page-index > 0 { pagebreak() }
  grid(columns: (badge-w, badge-w), rows: (badge-h, badge-h), gutter: 0mm, ..items.map(badge))
}
