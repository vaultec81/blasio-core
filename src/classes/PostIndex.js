const PouchDB = require('pouchdb');
const Path = require('path');
const OrbitDBAddress = require('orbit-db/src/orbit-db-address');
const debug = require('debug')("blasio-core:PostIndex")
PouchDB.plugin(require('pouchdb-find'));

class PostIndex {
    constructor() {
        this.updateIndex = this.updateIndex.bind(this)
        this._currentState = {};
    }
    async start(ipfs, parentDB) {
        this.ipfs = ipfs;
        var addr = OrbitDBAddress.parse(parentDB._oplog._id)
        this.cache = new PouchDB(Path.posix.join(parentDB.access._orbitdb.directory, 
            parentDB.access._orbitdb.id, 
            addr.root))
    }
    async get(ref) {
        try {
            return await this.cache.get(ref)
        } catch {
            return null;
        }
    }
    async _processNewState(newState) {
        //process insertions and updates
        for(const value of Object.values(newState)) {
            const {ref, cid, rev} = value;
            if(!this._currentState[ref]) {

                //Retrieve record from ipfs
                let data = ''
                for await (const chunk of this.ipfs.cat(cid)) {
                    // chunks of data are returned as a Buffer, convert it back to a string
                    data += chunk.toString()
                }
                //Check if record exists in cache 
                let record = {};
                try {
                    record = await this.cache.get(ref);
                } catch {}
                
                //if new rev number is higher than stored rev. Translate pouchdb's internal rev.
                let _rev;
                if(record.rev < rev) {
                    //Retrieve pouchdb revision 
                    _rev = record._rev;
                } else if (record.rev) {
                    //halt
                }

                //Store record in pouchdb cache
                await this.cache.put({
                    _id: ref,
                    json_content: JSON.parse(data),
                    _rev,
                    rev
                })
            }
        }
        //process deletions
        for(const value of Object.values(this._currentState)) { 
            const {ref, cid, rev} = value;
            if(!newState[ref]) { 
                let record = {};
                try {
                    record = await this.cache.get(ref);
                } catch {}
                
                record._deleted = true;

                await this.cache.put(record);
            }
        }
        this._currentState = newState;
    }
    async updateIndex(oplog) {
        let newState = {};
        for (var value of oplog.values) {
            const { ref, op, cid, rev } = value.payload;
            if(cid === undefined) {
                continue;
            }
            /*let record = {};
            try {
                record = await this.cache.get(ref);
            } catch {

            }
            let _rev;
            if(record.rev < rev) {
                //Retrieve pouchdb revision 
                _rev = record._rev;
            } else if (record.rev) {
                //halt
            }*/
           

            switch (op) {
                case "set": {
                    newState[ref] = {
                        ref, cid, rev 
                    }
                    break;
                }
                case "update": {
                    // Current revision lower than new?
                    // Protects against update operations with the same or lower rev number. 
                    //(Also increases performance by decreaseing unnecessary fetching and processing)
                    if(newState[ref].rev < rev) {
                        newState[ref] = {
                            ref, cid, rev 
                        }
                    }
                    break;
                }
                case "delete": {
                    break;
                }
            }
        }
        await this._processNewState(newState)
    }
}
module.exports = PostIndex;