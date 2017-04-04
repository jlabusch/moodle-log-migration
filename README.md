# moodle-log-migration

Proof of concept for migrating MDL_LOG as part of a site migration. Works out corresponding IDs for users, courses, etc. in the new site. Useful in cases where you're migrating using course backup+restore from older versions of Moodle (e.g. 2.8) which don't include logs in backups.

## Quick-start guide

 - Dump the databases from the old and new sites. (MySQL is assumed; update docker-compose if using pg etc.)
 - Put old.sql and new.sql into ./db/. (The names of the SQL files don't matter.)
 - Append DB creation statements at the top of each file, e.g.

&nbsp;

    create database moodle_old;
    use moodle_old;

 - Name the old database `moodle_old` and the new one `moodle_new`
 - Start the migration (`docker-compose up`)
 - You know the process has finished when you see statistics about the number of items migrated, e.g.

&nbsp;

    app_1  | {
    app_1  |   "mdl_log.forum.add post.count": 27640,
    app_1  |   "mdl_log.forum.add post.multiple_matches": 8,
    app_1  |   "mdl_log.forum.add post.multiple_matches_fixed": 8,
    app_1  |   "mdl_log.forum.delete discussion.count": 204315,
    ...
