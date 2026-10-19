# Free ebooks and guides

Only publish approved resources. Draft ebooks and guides stay unavailable.

A resource card opens `resource-download.html?resource=<id>`. Published resources ask for first name, surname and email, then Make sends the selected PDF link through Zoho and records the request in Airtable → Resource Requests.

## Placeholders
Use `status: "coming-soon"` and omit `file`. The card lets visitors preview the form, but the submit button is disabled and no details are sent.

## Publish an approved download
Upload the approved public PDF under `downloads/`, then replace the placeholder entry in `resources.json`:

```json
{
  "id": "your-approved-guide",
  "title": "Your approved guide title",
  "category": "Free guide",
  "description": "A short description of the approved PDF.",
  "file": "downloads/your-approved-guide.pdf",
  "status": "published"
}
```

IDs must be unique lowercase letters, numbers and hyphens, starting with a letter or number, with at most 80 characters. PDF paths use letters, numbers, hyphens, underscores and slashes, and end with lowercase `.pdf`.

Publish the real PDF and manifest together. Check that the PDF opens before enabling its published entry. Make reads the same manifest and accepts only published entries with a valid PDF path. It never emails a URL supplied by the visitor.

Requests use an immutable request ID to prevent a network retry from sending the same email twice. In Airtable, `Sending` without a message ID requires review before retrying; `Sent` means Zoho accepted delivery. Resource requests do not start investor onboarding or subscribe visitors to marketing.
