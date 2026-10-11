// A report for people to read and print (ADR 0058): title, facts and tables. Every value comes
// from /data.json, already formatted; user text is only ever displayed, never evaluated.
#let data = json("/data.json")
#let ink = rgb("#0e0d14")
#let muted = rgb("#5b5a6b")
#let rule = rgb("#e4e4ea")
#let soft = rgb("#f4f3f8")
#let brand = rgb("#5b3df5")
#let tones = (good: rgb("#15803d"), bad: rgb("#b91c1c"))

#set page(paper: "a4", margin: (x: 16mm, top: 16mm, bottom: 18mm),
  footer: context {
    set text(size: 7.5pt, fill: muted)
    grid(columns: (1fr, auto), data.footer, counter(page).display("1 / 1", both: true))
  })
#set text(font: "Lato", size: 9.5pt, fill: ink, lang: "pt")
#set par(leading: 0.55em)

#block(below: 7mm, {
  text(size: 8pt, fill: brand, weight: "bold", tracking: 0.08em, upper(data.kicker))
  v(1.5mm)
  text(size: 20pt, weight: "bold", data.title)
  v(1mm)
  text(size: 10pt, fill: muted, data.subtitle)
})

#let fact(f) = {
  let color = if f.tone == none { ink } else { tones.at(f.tone) }
  block(width: 100%, inset: (x: 3.5mm, y: 3mm), radius: 2mm, fill: if f.strong { soft } else { none },
    stroke: if f.strong { none } else { 0.4pt + rule },
    stack(spacing: 1.6mm,
      text(size: 7.5pt, fill: muted, f.label),
      text(size: if f.strong { 13pt } else { 11pt }, weight: "bold", fill: color, f.value)))
}

#for section in data.sections {
  block(breakable: true, below: 7mm, {
    text(size: 12pt, weight: "bold", section.title)
    if section.note != none {
      v(0.5mm)
      text(size: 8.5pt, fill: muted, section.note)
    }
    v(2.5mm)
    if section.facts.len() > 0 {
      grid(columns: (1fr,) * calc.min(section.facts.len(), 4), column-gutter: 2.5mm, row-gutter: 2.5mm,
        ..section.facts.map(fact))
      if section.table != none { v(3mm) }
    }
    if section.table != none {
      let tb = section.table
      let n = tb.headers.len()
      let numeric(i) = i >= tb.numericFrom
      table(
        columns: range(n).map(i => if i == tb.wide { 1fr } else { auto }),
        inset: (x: 2.2mm, y: 2mm),
        stroke: (x, y) => (bottom: 0.4pt + rule),
        fill: (_, y) => if y == 0 { soft },
        align: (x, _) => if numeric(x) { right } else { left },
        table.header(..tb.headers.map(h => text(size: 8pt, weight: "bold", fill: muted, h))),
        ..tb.rows.flatten().map(cell => text(size: 8.5pt, cell)),
        ..if tb.total != none { tb.total.map(cell => text(size: 8.5pt, weight: "bold", cell)) } else { () },
      )
    }
  })
}

#if data.signatures.len() > 0 {
  block(breakable: false, above: 14mm, grid(
    columns: (1fr,) * data.signatures.len(),
    column-gutter: 12mm,
    ..data.signatures.map(label => stack(spacing: 2mm,
      line(length: 100%, stroke: 0.6pt + muted),
      text(size: 8.5pt, fill: muted, label)))))
}
