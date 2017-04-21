var mysql = require('mysql'),
    pg = require('pg');

// Massage syntax from MySQL to PostgreSQL and account for any
// post-migration inconsistencies...
function mysql_to_postgres(sql) {
    return sql
                // pg does case-sensitive by default, we don't need BINARY matching
                .replace(/BINARY/g, '')
                // someone changed the shortname of course 1
                .replace(/shortname\s*=\s*'MSF e-Campus'/g, "shortname = 'MSF E-Campus'")
                // Don't need to escape double quotes
                .replace(/\\"/g, '"')
                // es_es -> es multilang change
                .replace(/"es_es"/, '"es"')
                // escaping single quotes works differently
                .replace(/\\'/g, "''");
}

function Postgres(spec){
    this.handle = new pg.Pool(spec);
    this.spec = spec;

    this.handle.on('error', (err, client) => {
        console.log(err.message);
    });
}

Postgres.prototype.query = function(){
    var args = Array.prototype.slice.call(arguments, 0);
    args[0] = mysql_to_postgres(args[0]);
    this.handle.query.apply(this.handle, args);
}

Postgres.prototype.test_connection = function(next){
    var self = this;
    this.handle.query(
        'select 1 + 1 as solution',
        function(err, res){
            if (err){
                console.log(JSON.stringify(err));
                setTimeout(() => { self.test_connection(next) }, 10000);
                return;
            }
            next();
        }
    );
}

function Mysql(spec){
    this.handle = mysql.createPool(spec);
    this.spec = spec;
}

Mysql.prototype.query = function(){
    this.handle.query.apply(this.handle, Array.prototype.slice.call(arguments, 0));
}

Mysql.prototype.test_connection = function(next){
    var conn = mysql.createConnection(this.spec),
        self = this;
    conn.connect();
    conn.query(
        'select 1 + 1 as solution',
        function(err, res, fields){
            if (err){
                console.log(JSON.stringify(err));
                setTimeout(() => { self.test_connection(next) }, 10000);
                return;
            }
            conn.end();
            next();
        }
    );
}

module.exports = {
    mysql_to_postgres: mysql_to_postgres,
    "old": new Mysql({
        host: "db_old",
        user: "root",
        password: "",
        database: "moodle_old",
        //debug: ['ComQueryPacket', 'RowDataPacket'],
        connectionLimit: 20
    }),
    "new": new Postgres({
        host: "db_new",
        user: "postgres",
        password: "abc123",
        database: "postgres",
        max: 20
    })
};

