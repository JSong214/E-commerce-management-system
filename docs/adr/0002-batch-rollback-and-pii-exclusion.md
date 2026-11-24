---
status: accepted
---

# Exact Batch Rollback via Change Snapshots & Pre-Storage PII Stripping

We support exact **Batch Rollback** (deleting inserted rows and restoring Upsert-updated rows to their pre-batch values, restricted to reverse chronological order when batches touch overlapping order lines) by recording pre-update row snapshots per **Import Batch** in MySQL, rather than only supporting insert-only deletion.

We also strip buyer PII (recipient name, phone number, detailed street address) during parsing before database persistence — excluding it from both canonical columns and `raw_extra` JSON — retaining only `province` and `city` for geographic analysis. Uploaded raw files are purged after parsing, keeping only validation error-row exports for download.
