# Маршруты «Сов во льдах»

Approved in chat: routes alongside existing places; participant selector, expedition selector, numbered stops and directional schematic lines; stop card with episode and chapter. Default narrator, distinct supported companions. Only reached text is visible, including step content; current chapter's episodes unlock at chapter end to avoid in-chapter spoilers. No new heroes section. Existing map data, background, zoom/pan, links and app tokens remain canonical. Repeated visits remain separate stops, trips are not joined. No route is inferred from a mere geographic mention or guessed GPS track.

Data: private article.journeys array, each {id,name,people:[{id,name}],stops:[{place,ch,people:[id],text,quote,evidence}]}. Stop coordinates resolved from existing article.map. ch uses book chapter index including frontmatter. Evidence is a literal source paragraph checked against extracted EPUB. Published app contains generic rendering only, no book text.

Canonical controls: existing #gmap overlay, gmLayers, gmStage, gmCard, mapXY, gmFocus and touch gestures. Native select for participant/trip, consistent with map select; horizontally scrolling numbered buttons with aria-current. Empty route explains that stops unlock after reading. No invented portraits.


Final approved refinement: one chronological participant timeline with chapter jump selector. Show selected chapter plus preceding stop, with dashed straight-line guide and straight-line distance across chapter/trip boundaries; unresolved coordinates and membership gaps still break guides. Places open as a contextual list with unique emoji and first textual mention ordering; tap opens only that location and Back returns to list. Per-stop period, time of day and weather come from the supplied book, with broad expedition periods labelled. Contextual ChatGPT link remains beside Yandex. Remove generic route caveat footer from cards.
