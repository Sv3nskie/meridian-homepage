# Meridian — Homepage

Single-page marketing homepage for **Meridian**, built from the design handoff (Nocturne design system) as plain HTML, CSS and JavaScript. No build step and no dependencies: GitHub Pages serves it as is.

## Structure

```
index.html        Markup for all sections
css/nocturne.css  Design-system tokens and components (Nocturne)
css/main.css      Page layout, responsive rules and animation states
js/main.js        Scroll choreography, nav/menu, pointer effects, form
favicon.svg
```

## Behaviour

- **Every animation reverses on scroll-up.** Pinned chapters (services stack, horizontal statement, client stories) and the hero, word-lighting, parallax and 3D plate stack are all driven by scroll position. Entrance reveals (fade-ups, image wipes, counters, footer wordmark) play when an element's top crosses 90% of the viewport and play in reverse when you scroll back above it. The logo marquee follows scroll direction.
- **Responsive:** the desktop nav and mega-menu appear at 900px and up. Below that there's a full-screen menu. Tablet and phone layouts rearrange the service cards, story controls, stats and footer. Pinned sections use `svh` units so mobile browser bars never hide content, and landscape phones get their own compact layout.
- **Reduced motion:** with `prefers-reduced-motion`, the page shows every section in its final state: no intro, cursor, parallax or reveals.
- The intro curtain plays once per browser session. Add `?intro` to the URL to replay it.

## Local preview

Serve the folder with any static server, for example:

```
npx serve .
```

## Before going live

- **Contact form:** it currently shows the success state without sending anything. To deliver enquiries, set `data-endpoint` on the `<form>` in `index.html` to a form service URL (Formspree, Basin, etc.).
- **Photography:** the photos are placeholder Unsplash images (John Murphey, Bruno BD, Vitor Paladini, Sergio Franklin, Vitaly Gariev, Martin Laprise, Joshua Fernandez, Maxim, Drew, Richard Jaimes, Joe Shields). Replace them with the client's own images, shot on dark backgrounds.
- **Contact details:** the email address, phone number, street address and social links are placeholders.
