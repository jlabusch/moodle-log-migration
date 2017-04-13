var mysql = require('mysql'),
    pg = require('pg');

function Postgres(spec){
    this.handle = new pg.Pool(spec);
    this.spec = spec;

    this.handle.on('error', (err, client) => {
        console.log(err.message);
    });
}

Postgres.prototype.query = function(){
    var args = Array.prototype.slice.call(arguments, 0);
    // Massage syntax from MySQL to PostgreSQL and account for any
    // post-migration inconsistencies...
    args[0] = args[0]
                // pg does case-sensitive by default, we don't need BINARY matching
                .replace(/BINARY/g, '')
                // someone changed the shortname of course 1
                .replace(/shortname\s*=\s*'MSF e-Campus'/, "shortname = 'MSF E-Campus'")
                // escaping single quotes works differently
                .replace(/\\'/g, "''");
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
    "old": new Mysql({
        host: "db_old",
        user: "root",
        password: "abc123",
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

