-- ADR 0102: home printing on ready-made paper (perforated A4, sheets of labels) besides plain A4.
alter table exports
    add column paper text not null default 'plain' check (paper in (
        'plain', 'perforated3', 'perforated4', 'perforated6', 'perforated8', 'perforated10',
        'labels21', 'labels14', 'labels8', 'labels2'
    ));
