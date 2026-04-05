update public.content_sections
set content = jsonb_build_object(
  'stats',
  jsonb_build_array(
    jsonb_build_object(
      'id', 'years',
      'value', '4+',
      'label', 'Yillik tajriba',
      'description', 'Tabiat bag''rida mehmon kutish va xizmat ko''rsatish tajribasi.',
      'icon', 'calendar'
    ),
    jsonb_build_object(
      'id', 'guests',
      'value', '5000+',
      'label', 'Mehmonlar',
      'description', 'Ravotsoyda hordiq chiqargan oilalar, sayohatchilar va guruhlar.',
      'icon', 'users'
    )
  )
)
where page = 'home'
  and section_type = 'about'
  and (
    content = '{}'::jsonb
    or not (content ? 'stats')
    or jsonb_typeof(content->'stats') <> 'array'
    or jsonb_array_length(content->'stats') = 0
  );
