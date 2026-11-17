# Локальные issues

Реализация предварительного MVP добавлена. LR-001/020/021 заблокированы отсутствием проверок на целевых устройствах; остальные задачи MVP — **in-progress** до полной приёмки. ID LR-xxx — локальные идентификаторы, не номера GitHub.

**P0:** блокирует MVP. **P1:** необходимо для завершения MVP. **P2:** после MVP.
M0 — исследования; M1 — основа; M2 — чтение; M3 — проверка и релиз.
Зависимости задают порядок начала работ, а не только приоритет.

| ID | Задача | Приоритет | Этап | Зависимости | Статус |
| --- | --- | --- | --- | --- | --- |
| [LR-001](001-devices-budgets.md) | Утвердить устройства, минимальные ОС и бюджеты | P0 | M0 | — | blocked |
| [LR-002](002-engine-feasibility.md) | Проверить движки всех форматов и их лицензии | P0 | M0 | [LR-001](001-devices-budgets.md) | in-progress |
| [LR-003](003-architecture-decision.md) | Выбрать стек и оформить архитектурное решение | P0 | M0 | [LR-001](001-devices-budgets.md), [LR-002](002-engine-feasibility.md) | in-progress |
| [LR-004](004-mobile-design.md) | Спроектировать мобильный интерфейс по мотивам Thorium | P1 | M0 | — | in-progress |
| [LR-005](005-mobile-bootstrap.md) | Создать проекты iOS/Android и воспроизводимые сборки | P0 | M1 | [LR-003](003-architecture-decision.md) | in-progress |
| [LR-006](006-library-storage.md) | Реализовать локальную модель библиотеки и миграции | P0 | M1 | [LR-005](005-mobile-bootstrap.md) | in-progress |
| [LR-007](007-file-import.md) | Добавить импорт книг средствами iOS и Android | P0 | M1 | [LR-006](006-library-storage.md), [LR-008](008-reader-contract.md) | in-progress |
| [LR-008](008-reader-contract.md) | Определить контракт адаптеров чтения | P0 | M1 | [LR-005](005-mobile-bootstrap.md) | in-progress |
| [LR-009](009-library-ui.md) | Реализовать библиотеку и «Продолжить чтение» | P1 | M1 | [LR-004](004-mobile-design.md), [LR-006](006-library-storage.md), [LR-007](007-file-import.md) | in-progress |
| [LR-010](010-fb2-reader.md) | Реализовать чтение FB2 | P0 | M2 | [LR-002](002-engine-feasibility.md), [LR-007](007-file-import.md), [LR-008](008-reader-contract.md) | in-progress |
| [LR-011](011-epub-reader.md) | Реализовать EPUB 2/3 и fixed layout | P0 | M2 | [LR-002](002-engine-feasibility.md), [LR-007](007-file-import.md), [LR-008](008-reader-contract.md) | in-progress |
| [LR-012](012-pdf-reader.md) | Реализовать постраничное чтение PDF | P0 | M2 | [LR-002](002-engine-feasibility.md), [LR-007](007-file-import.md), [LR-008](008-reader-contract.md) | in-progress |
| [LR-013](013-djvu-reader.md) | Реализовать чтение DjVu | P0 | M2 | [LR-002](002-engine-feasibility.md), [LR-007](007-file-import.md), [LR-008](008-reader-contract.md) | in-progress |
| [LR-014](014-custom-fonts.md) | Добавить импорт и применение своих TTF/OTF | P0 | M2 | [LR-006](006-library-storage.md), [LR-010](010-fb2-reader.md), [LR-011](011-epub-reader.md) | in-progress |
| [LR-015](015-reading-controls.md) | Реализовать экран чтения и настройки | P1 | M2 | [LR-004](004-mobile-design.md), [LR-008](008-reader-contract.md), [LR-010](010-fb2-reader.md), [LR-011](011-epub-reader.md), [LR-012](012-pdf-reader.md), [LR-013](013-djvu-reader.md), [LR-014](014-custom-fonts.md) | in-progress |
| [LR-016](016-progress-bookmarks.md) | Сохранять точное место чтения и закладки | P1 | M2 | [LR-006](006-library-storage.md), [LR-010](010-fb2-reader.md), [LR-011](011-epub-reader.md), [LR-012](012-pdf-reader.md), [LR-013](013-djvu-reader.md) | in-progress |
| [LR-017](017-text-search.md) | Добавить поиск внутри FB2 и reflow EPUB | P1 | M2 | [LR-010](010-fb2-reader.md), [LR-011](011-epub-reader.md), [LR-015](015-reading-controls.md) | in-progress |
| [LR-018](018-accessibility.md) | Проверить доступность и локализацию интерфейса | P1 | M3 | [LR-009](009-library-ui.md), [LR-015](015-reading-controls.md), [LR-016](016-progress-bookmarks.md), [LR-017](017-text-search.md) | in-progress |
| [LR-019](019-file-hardening.md) | Защитить импорт и рендеринг повреждённых файлов | P0 | M3 | [LR-007](007-file-import.md), [LR-010](010-fb2-reader.md), [LR-011](011-epub-reader.md), [LR-012](012-pdf-reader.md), [LR-013](013-djvu-reader.md), [LR-014](014-custom-fonts.md) | in-progress |
| [LR-020](020-performance-pass.md) | Измерить и оптимизировать размер, память и энергию | P0 | M3 | [LR-001](001-devices-budgets.md), [LR-009](009-library-ui.md), [LR-015](015-reading-controls.md), [LR-016](016-progress-bookmarks.md), [LR-017](017-text-search.md), [LR-019](019-file-hardening.md) | blocked |
| [LR-021](021-release-mvp.md) | Подготовить проверяемый релиз MVP | P0 | M3 | [LR-018](018-accessibility.md), [LR-019](019-file-hardening.md), [LR-020](020-performance-pass.md) | blocked |
| [LR-022](022-archives-djvu-variants.md) | Расширить импорт: FB2 ZIP и indirect DjVu | P2 | После MVP | [LR-021](021-release-mvp.md) | open |
| [LR-023](023-annotations-search.md) | Добавить текстовый поиск PDF/DjVu и заметки | P2 | После MVP | [LR-021](021-release-mvp.md) | open |
| [LR-024](024-optional-sync.md) | Спроектировать необязательное резервирование и синхронизацию | P2 | После MVP | [LR-021](021-release-mvp.md) | open |

## Начать здесь

LR-001 и LR-004 не имеют зависимостей. Затем LR-002 подтверждает движки и лицензии, LR-003 фиксирует стек. Код приложения начинается после этих решений.

MVP требует завершения **всех P0/P1 (LR-001…LR-021)**. FB2, EPUB, DjVu, PDF и собственные шрифты обязательны на обеих платформах. LR-022…LR-024 не входят в MVP.

[Шаблон новой задачи](TEMPLATE.md) · [Правила работы](../CONTRIBUTING.md)
