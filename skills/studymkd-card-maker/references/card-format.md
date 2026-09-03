# StudyMKD card exchange format

The source file has this required shape:

```json
{
  "format": "studymkd-note",
  "version": 1,
  "exportedAt": "ISO-8601 timestamp",
  "project": { "id": "project id", "title": "project title" },
  "chapter": { "id": "chapter id", "title": "chapter title" },
  "note": { "markdown": "note content", "contentHash": "sha256 hex" }
}
```

The generated file must have this exact top-level shape:

```json
{
  "format": "studymkd-cards",
  "version": 1,
  "generatedAt": "ISO-8601 timestamp",
  "source": {
    "projectId": "copied from project.id",
    "projectTitle": "copied from project.title",
    "chapterId": "copied from chapter.id",
    "chapterTitle": "copied from chapter.title",
    "contentHash": "copied from note.contentHash"
  },
  "cards": [
    {
      "question": "A focused question",
      "answer": "An answer grounded in the note",
      "sourceExcerpt": "A short exact excerpt from note.markdown",
      "tags": ["optional", "short tags"]
    }
  ]
}
```

Constraints:

- `cards` must contain 1-100 items.
- `question` and `answer` are required non-empty strings.
- `question` is at most 500 characters; `answer` is at most 5000 characters.
- `sourceExcerpt` is optional and at most 1000 characters. When present, copy the note fragment that anchors the card's topic; the answer may contain directly related expanded knowledge.
- `tags` is optional and contains at most 10 non-empty strings. It may include standard terms that clarify a topic found in the note.
- Do not include application card IDs, scheduling fields, or repetition state; StudyMKD creates those during import.
