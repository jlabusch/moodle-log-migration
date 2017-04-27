# moodle-log-migration

Proof of concept for migrating MDL_LOG as part of a site migration. Works out corresponding IDs for users, courses, etc. in the new site. Useful in cases where you're migrating using course backup+restore from older versions of Moodle (e.g. 2.8) which don't include logs in backups.

Built for the case where the old DB is MySQL and the new DB is Postgres, but can be made to work with any combination of the two.


## Quick-start guide

 - run `make prep` to create the directory structure under `./db/`.
 - Dump the databases from the old and new sites. (Update `docker-compose.yml` and `dbs.js` to match your choice of MySQL or Postgres.)
 - Put old.sql and new.sql into `./db/old/init/` and `./db/new/init/`. (The names of the SQL files don't matter.)
 - Insert DB creation statements at the top of each file if needed, e.g.

&nbsp;

    create database moodle_old;
    use moodle_old;

 - Make sure the database names and user details line up with what's specified in `./lib/dbs.js` (see module.exports at the bottom of the file.)
 - Start the migration (`docker-compose up`)
 - When each module finishes it'll print statistics like:

&nbsp;

    app_1  | {
    app_1  |   "mdl_log.forum.add post.count": 27640,
    app_1  |   "mdl_log.forum.add post.multiple_matches": 8,
    app_1  |   "mdl_log.forum.add post.multiple_matches_fixed": 8,
    app_1  |   "mdl_log.forum.delete discussion.count": 204315,
    ...

Environment variables supported:

 - DISABLE_AUDIT: if set, don't create ./data/audit_logs.tsv.
 - LOSSY_AUDIT: only spot-check; write log2(n) entries to the audit log.
 - RESTRICT_MODULES: A comma-separated whitelist of modules to migrate. (Unset means no restriction, migrate everything.)
 - RESTRICT_ACTIONS: As above, but actions instead of modules.

Debugging:

 - PHPMyAdmin will run on localhost:8081 in case you need to look at the old database schema
 - pgadmin4 will run on localhost:5051

