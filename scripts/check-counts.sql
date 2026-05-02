SELECT 'Property' as tbl, COUNT(*) FROM "Property"
UNION ALL SELECT 'Contact', COUNT(*) FROM "Contact"
UNION ALL SELECT 'Buyer', COUNT(*) FROM "Buyer"
UNION ALL SELECT 'Vendor', COUNT(*) FROM "Vendor"
UNION ALL SELECT 'ActivityLog', COUNT(*) FROM "ActivityLog"
UNION ALL SELECT 'Message', COUNT(*) FROM "Message"
UNION ALL SELECT 'Note', COUNT(*) FROM "Note"
UNION ALL SELECT 'Task', COUNT(*) FROM "Task";
