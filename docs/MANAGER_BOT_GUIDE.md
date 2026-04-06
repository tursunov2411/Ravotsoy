# Manager Bot Guide

## Main Sections

- `📚 Bronlar`: booking queues, filters, details, edits, calendar
- `🏡 Resurslar`: resource visibility and quick operational management
- `💵 Narxlar`: pricing rule controls
- `💳 To'lov sozlamalari`: card and payment instruction setup
- `🧍 Offlayn mehmonlar`: offline/walk-in booking creation
- `📊 Analitika`: period summaries and occupancy
- `🗂 Hisobotlar`: daily report, operations closeout, CSV, recipients
- `💰 Balans`: expenses, handovers, earnings
- `🔐 Nazorat`: current manager visibility, transfer, audit log
- `🛠 Tizim holati`: system snapshot
- `🩺 Diagnostika`: health checks and wake/reconnect actions

## Bronlar

From booking details, the manager can:

- approve
- reject
- see proof
- mark check-in
- mark payment complete
- mark guest completed
- change customer name
- change phone
- move dates
- change total price
- cancel/free the booking

## Offlayn Mehmonlar

Use this when the guest came directly, called, or booked outside Telegram.

The manager can:

- pick resource type
- choose tapchan included/excluded when relevant
- choose quantity
- choose date and duration
- enter guest name and phone
- enter any non-negative final total price, including `0`

## Balans

- `➕ Xarajat qo'shish`: add expense name and amount
- `📋 Xarajatlar`: recent expense list
- `📤 Topshirildi`: record handover to owner
- `🧾 Topshirilganlar`: handover history
- `💼 Mening daromadim`: 25% earnings view

## Hisobotlar

- `🌙 Bugungi hisobot`: send the daily report to owner recipients
- `📋 Operatsion close`: view today + tomorrow operations summary
- `⬇️ Bronlar CSV`: export booking history
- `👤 Qabul qiluvchilar`: manage report recipients

## Nazorat

- `🔁 Nazoratni topshirish`: create one-time manager transfer token
- `🧾 Harakatlar jurnali`: review recent manager actions
- `🔄 Yangilash`: refresh manager control view

## Diagnostika

- `🛠 Tizim holati`: quick operational numbers
- `🩺 Diagnostika`: read-only health checks
- `⚡ Uyg'otish / ulash`: wake backend and refresh webhooks/connections
