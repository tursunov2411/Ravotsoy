alter table public.content_sections
  drop constraint if exists content_sections_type_check;

update public.content_sections
set
  section_type = 'faq',
  eyebrow = 'Ko''p beriladigan savollar',
  title = 'Savollaringiz bormi? Bizda javoblar tayyor!',
  description = 'Eng ko''p so''raladigan savollar va bron qilishdan oldingi muhim ma''lumotlar.',
  content = jsonb_build_object(
    'items',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'faq-1',
        'question', 'Piknik uchun o''zimiz bilan nimalar olib kelishimiz kerak?',
        'answer', 'Sizdan faqat pishiriladigan masalliqlar va yaxshi kayfiyat so''raladi. Bizda barcha oshxona anjomlari: o''choq, qozon, mangal, shashlik sixlari va idish-tovoqlar to''liq mavjud va paket ichiga kiradi.'
      ),
      jsonb_build_object(
        'id', 'faq-2',
        'question', 'Dam olish maskani Registon maydonidan qancha uzoqlikda joylashgan?',
        'answer', 'Bizning maskanimiz Samarqand shahridan bor-yo''g''i 1.5 soatlik, taxminan 80-90 km masofada, Kitob tumanining so''lim Ravotsoy darasida joylashgan. Yo''llar asfaltrlangan va qulay.'
      ),
      jsonb_build_object(
        'id', 'faq-3',
        'question', 'Oilaviy dam olish uchun sharoitlar xavfsiz va alohidami?',
        'answer', 'Albatta. Biz 4 yildan buyon oilaviy dam olishga ixtisoslashganmiz. Har bir oila uchun alohida xona, basseyn va tapchan ajratiladi. Hududimiz yopiq va begona ko''zlardan xoli.'
      ),
      jsonb_build_object(
        'id', 'faq-4',
        'question', 'Basseyn suvi har kuni tozalanadimi?',
        'answer', 'Ha, biz mehmonlarimiz salomatligiga jiddiy qaraymiz. Basseyn zamonaviy filtrlash tizimi bilan jihozlangan va har bir yangi mehmon guruhidan oldin suv nazorat qilinib, tozalanadi.'
      ),
      jsonb_build_object(
        'id', 'faq-5',
        'question', 'Elektr energiyasi va aloqa (Internet) bormi?',
        'answer', 'Ha, maskanimiz to''liq elektrlashtirilgan. Shuningdek, hududda barcha mobil aloqa operatorlari yaxshi ishlaydi, shuning uchun aloqasiz qolib ketmaysiz.'
      ),
      jsonb_build_object(
        'id', 'faq-6',
        'question', 'Bron qilish tartibi qanday?',
        'answer', 'Joylarimiz cheklanganligi sababli, kamida 2-3 kun oldin Telegram yoki telefon orqali bog''lanib, kichik miqdorda avans to''lash orqali joyingizni band qilishingizni tavsiya etamiz.'
      )
    ),
    'cta_label',
    'Boshqa savolingiz bormi? Telegramdan so''rang'
  )
where page = 'home'
  and section_type = 'highlights';

insert into public.content_sections (page, section_type, eyebrow, title, description, content, sort_order, is_enabled)
select
  'home',
  'faq',
  'Ko''p beriladigan savollar',
  'Savollaringiz bormi? Bizda javoblar tayyor!',
  'Eng ko''p so''raladigan savollar va bron qilishdan oldingi muhim ma''lumotlar.',
  jsonb_build_object(
    'items',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'faq-1',
        'question', 'Piknik uchun o''zimiz bilan nimalar olib kelishimiz kerak?',
        'answer', 'Sizdan faqat pishiriladigan masalliqlar va yaxshi kayfiyat so''raladi. Bizda barcha oshxona anjomlari: o''choq, qozon, mangal, shashlik sixlari va idish-tovoqlar to''liq mavjud va paket ichiga kiradi.'
      ),
      jsonb_build_object(
        'id', 'faq-2',
        'question', 'Dam olish maskani Registon maydonidan qancha uzoqlikda joylashgan?',
        'answer', 'Bizning maskanimiz Samarqand shahridan bor-yo''g''i 1.5 soatlik, taxminan 80-90 km masofada, Kitob tumanining so''lim Ravotsoy darasida joylashgan. Yo''llar asfaltrlangan va qulay.'
      ),
      jsonb_build_object(
        'id', 'faq-3',
        'question', 'Oilaviy dam olish uchun sharoitlar xavfsiz va alohidami?',
        'answer', 'Albatta. Biz 4 yildan buyon oilaviy dam olishga ixtisoslashganmiz. Har bir oila uchun alohida xona, basseyn va tapchan ajratiladi. Hududimiz yopiq va begona ko''zlardan xoli.'
      ),
      jsonb_build_object(
        'id', 'faq-4',
        'question', 'Basseyn suvi har kuni tozalanadimi?',
        'answer', 'Ha, biz mehmonlarimiz salomatligiga jiddiy qaraymiz. Basseyn zamonaviy filtrlash tizimi bilan jihozlangan va har bir yangi mehmon guruhidan oldin suv nazorat qilinib, tozalanadi.'
      ),
      jsonb_build_object(
        'id', 'faq-5',
        'question', 'Elektr energiyasi va aloqa (Internet) bormi?',
        'answer', 'Ha, maskanimiz to''liq elektrlashtirilgan. Shuningdek, hududda barcha mobil aloqa operatorlari yaxshi ishlaydi, shuning uchun aloqasiz qolib ketmaysiz.'
      ),
      jsonb_build_object(
        'id', 'faq-6',
        'question', 'Bron qilish tartibi qanday?',
        'answer', 'Joylarimiz cheklanganligi sababli, kamida 2-3 kun oldin Telegram yoki telefon orqali bog''lanib, kichik miqdorda avans to''lash orqali joyingizni band qilishingizni tavsiya etamiz.'
      )
    ),
    'cta_label',
    'Boshqa savolingiz bormi? Telegramdan so''rang'
  ),
  20,
  true
where not exists (
  select 1
  from public.content_sections
  where page = 'home'
    and section_type = 'faq'
);

alter table public.content_sections
  add constraint content_sections_type_check
  check (section_type in ('about', 'faq', 'packages', 'gallery', 'sightseeing', 'contacts'));
