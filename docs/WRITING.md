# Writing a blog post

You write a post as one Markdown file in this repo. The site adds the page layout, fonts,
colours, day and night themes, table of contents, reading time, search, RSS feed and
social preview image. You do not need to style anything.

## 1. Create the post

Work on the `develop` branch. From the repo root, run:

```bash
make post title="My post title"
```

This creates `web/src/content/blog/my-post-title.md` as a draft. The file name becomes the
URL (`/blog/my-post-title/`), so do not rename the file after you publish it.

Fill in the fields at the top of the file:

| Field     | Required | What it does                                                                                                                                               |
| --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`   | Yes      | The page title.                                                                                                                                            |
| `dek`     | Yes      | One sentence under the title, also used in lists and previews. The tests fail on a published post if it still says TODO.                                   |
| `date`    | Yes      | The publication date. Posts are sorted by this date.                                                                                                       |
| `tags`    | Yes      | One or more of `Numerics`, `HPC`, `Scientific ML`, `GPU` and `Notes` (`TOPICS` in `web/src/content.config.ts`). Any other value stops the build.           |
| `draft`   | No       | `true` keeps the post out of the live site. A post with no `draft` field is also a draft.                                                                  |
| `updated` | No       | The date of a later correction.                                                                                                                            |
| `toc`     | No       | `false` hides the table of contents.                                                                                                                       |
| `hero`    | No       | A large image under the header: `image`, `alt`, and optionally `imageDay` (a version for the day theme) and `caption`.                                     |

## 2. Write

Everything below works in a plain `.md` file.

- **Headings:** start at `##`. The page title is the only top-level heading. `##` and `###`
  headings link to themselves.
- **Text:** bold, italics, links, lists, quotations, `inline code`, tables and `---` rules.
- **Equations:** `$D_u = 1$` inside a sentence. For a displayed equation, put `$$` on the
  lines above and below it. Write `\tag{1}` to number it.
- **Code:** a fenced block with a language. Add a file name with
  ` ```python title="step.py" `.
- **Images:** put them in `web/src/assets/blog/<slug>/` and write
  `![Description of the image](../../assets/blog/<slug>/image.jpg)`. Always write the
  description, because screen readers read it. The build resizes and compresses the image.

### When you need more than Markdown

Four things need an `.mdx` file: `<Sidenote>`, `<Callout>`, `<Figure>` (a numbered image with
a caption, or one with a day version) and `<LiveField>` (the live simulation). To use them,
rename the file from `.md` to `.mdx`. You do not need to import them.
`web/src/content/blog/example-draft.mdx` shows each one.

In an `.mdx` file, a `<` or `{` in ordinary text can stop the build, because MDX reads them
as code. Write them as `\<` and `\{`, or keep them inside `$...$` or backticks.

## 3. Preview

```bash
make dev-web
```

Open `http://localhost:4321/blog/<slug>/`. The page reloads each time you save. Check the day
and night themes with the button at the top right, and narrow the window to check the phone
layout.

Drafts appear only here. They do not appear on staging or on the live site. The "Useful"
button and the read count stay hidden in this preview, which is normal.

## 4. Publish

1. Set `draft: false` and check that `date` is the publication date.
2. Commit the post and its images on `develop`, then push.
3. Wait for the CI and Staging QA workflows to pass, and read the post on
   `https://next.sagar-pal.dev/blog/<slug>/`. A failure on the post usually means an image
   without a description, or content that makes the phone layout scroll sideways.
4. Open a pull request from `develop` to `main`, and squash-merge it. **It releases everything
   on `develop`, not only the post.**
5. Merge `origin/main` back into `develop`, so that the next pull request shows only new
   changes.
6. A push to `main` starts a production deploy. Check that the post is on
   `https://sagar-pal.dev/blog/`. If no deployment starts, see `DEPLOYMENT.md` section 5.

The first published post also changes the site by itself: the blog's "Nothing published yet"
page goes away, and the home page gets a Writing section and a "Read the writing" button.

## Change or remove a published post

- **To correct a post:** edit the file, set `updated`, and follow the steps in section 4.
- **To take a post down:** set `draft: true` and follow the same steps. Its URL then returns 404.
