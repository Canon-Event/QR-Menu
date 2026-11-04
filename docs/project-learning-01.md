# Lesson 1: Your project and your first line of code

Read this one lesson, try the small exercise, and explain it aloud. That is enough for the first session.

**What are you building?**

WIIT helps restaurants publish a digital menu that customers open by scanning a QR code. Restaurant owners manage their dishes in a dashboard. The project also has optional ordering and a loyalty stamp-card feature.

There are two main experiences:

| Person | What they do |
| --- | --- |
| Restaurant owner | Signs in, edits dishes and prices, manages orders and rewards |
| Customer | Scans a QR, browses the menu, and can join rewards when available |

Your Shopify experience gives you a useful comparison: the restaurant dashboard is like the merchant admin, and the customer menu is like the storefront.

**Where does a page come from?**

A file path is an address for a file inside your project. In `app/plans/page.tsx`, open the `app` folder, then `plans`, then the file named `page.tsx`.

This project uses Next.js, a tool that connects page files to website addresses:

| File in the project | Page address |
| --- | --- |
| `app/page.tsx` | `/` — the homepage |
| `app/plans/page.tsx` | `/plans` — the plans page |
| `app/dashboard/loyalty/page.tsx` | `/dashboard/loyalty` — the loyalty dashboard |

You can think of each `page.tsx` as the starting point for that screen. It can use other files to build the finished screen.

**Read one real line.**

Open [`app/page.tsx`](../app/page.tsx) and find:

```tsx
<p className="eyebrow mb-4">A simpler way to serve your menu</p>
```

- `<p>` starts a paragraph of text.
- `A simpler way to serve your menu` is what the visitor reads.
- `</p>` ends the paragraph.
- `className="eyebrow mb-4"` attaches styling instructions to it. `mb-4` adds space below it. We will learn styling separately.

This HTML-like syntax in React files is called **JSX**. For today, focus on identifying the visible text between the tags.

**Your five-minute exercise**

1. Find that line in `app/page.tsx`.
2. Change only the sentence to `Your restaurant menu, one scan away`.
3. Save the file and view the homepage in your running local app.
4. Notice that the words changed while the styling stayed the same.
5. Put the original sentence back and save again.

If your local app is not running, open the project terminal, enter `npm run dev`, and open the **Local** address printed there. That command starts a development version of your website on your computer.

**Practice explaining it**

> “My project is a restaurant QR-menu app. Owners manage their menu in a dashboard, and customers scan a QR to view it. It uses Next.js, where files such as app/page.tsx define pages. I can change visible text inside a page without changing its styling.”

Quick check: in the example line, which part changes the words the visitor sees, and which part controls styling?

Next lesson: a **component** — a reusable piece of a page, using your existing navigation bar as the example.
