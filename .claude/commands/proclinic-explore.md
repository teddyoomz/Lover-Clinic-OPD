---
name: proclinic-explore
description: Explore ProClinic pages via Chrome browser to reverse-engineer UI/forms/fields for replication.
user-invocable: true
argument-hint: "[url path e.g. /admin/deposit or page name]"
---

# ProClinic Explorer

Use Claude in Chrome (browser automation) to explore ProClinic pages and extract UI/field information for backend replication.

## Login credentials (trial):
- URL: https://proclinicth.com/login
- Email: demo12@proclinic.com
- Password: qqqqqq

## Steps:
1. Open Chrome tab, navigate to the ProClinic URL
2. Login if not already logged in
3. Navigate to the requested page ($ARGUMENTS or ask user)
4. Take screenshots of the page layout
5. Read the page structure (forms, fields, dropdowns, tables)
6. Extract all field names, types, options, and validation rules
7. Report findings in a structured format for plan integration

## Rules:
- NEVER modify data in ProClinic — read-only exploration
- Save important findings to memory files
- Compare with existing reverse engineering docs (reference_proclinic_full_system.md)
