'use strict'

const Store = require('orbit-db-store')
const PostIndex = require('./PostIndex')
const debug = require('debug')("blasio-core:PostStore")

class PostStore extends Store {
    constructor(ipfs, id, dbname, options) {
        if (!options) options = {};
        if (!options.Index) Object.assign(options, { Index: PostIndex })
        super(ipfs, id, dbname, options)
        this._type = 'blasio.poststore';

        this._index.start(this._ipfs, this);
    }
    /**
     * Creates a new post under a given ref/path
     * @param {String} ref 
     * @param {Objects} postInfo 
     */
    async put(ref, postInfo) {
        let unixFsFile = await this._ipfs.add({ content: JSON.stringify(postInfo), path: "" });
        let { cid } = unixFsFile;

        if (await this.get(ref)) {
            throw new Error("Post Already Exists");
        }
        try {
            return await this._addOperation({
                ref,
                cid: cid.toString(),
                op: "set",
                rev: 1
            })
        } catch (ex) {
            throw ex;
        }
    }
    async get(ref) {
        var record = (await this._index.get(ref));
        if (record) {
            return record.json_content
        } else {
            return null
        }
    }
    async query(request, options) {
        if(!request.selector) {
            request.selector = {};
        }
        try {
            var result = await this._index.cache.find(request);
            return result.docs;
        } catch (err) {
            console.log(err)
            debug(`error: ${err}`)
            return [];
        }
    }
}
module.exports = PostStore;