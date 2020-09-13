const AccessController = require('orbit-db-access-controllers/src/access-controller-interface')
const pMapSeries = require('p-map-series')
const ensureAddress = require('orbit-db-access-controllers/src/utils/ensure-ac-address')

/**
 * 
 */
class AuthorityAC extends AccessController {
    constructor(orbitdb, options) {
        super()
        this._orbitdb = orbitdb
        this._db = null
        this._options = options || {}
    }
    static get type() {
        return 'blasio.authority'
    }
    get address() {
        return this._db.address
    }
    async canAppend(entry, identityProvider) {
        // Write keys and admins keys are allowed
        const access = new Set(this._db.query(() => true).map((v) => v._id))
        // If the ACL contains the writer's public key or it contains '*'
        if (access.has(entry.identity.id) || access.has('*')) {
            const verifiedIdentity = await identityProvider.verifyIdentity(entry.identity)
            // Allow access if identity verifies
            return verifiedIdentity
        }

        return false
    }
    async load(address) {
        if (this._db) { await this._db.close() }

        // Force '<address>/_access' naming for the database
        this._db = await this._orbitdb.docstore(ensureAddress(address), {
            // use ipfs controller as a immutable "root controller"
            accessController: {
                type: 'ipfs',
                write: this._options.admin || [this._orbitdb.identity.id]
            },
            sync: true
        })

        this._db.events.on('ready', this._onUpdate.bind(this))
        this._db.events.on('write', this._onUpdate.bind(this))
        this._db.events.on('replicated', this._onUpdate.bind(this))

        await this._db.load()
    }
    async save() {
        // return the manifest data
        return {
            address: this._db.address.toString()
        }
    }
    async grant(capability, key) {
        await this._db.put({
            _id: key,
            capability,
            type: "authority"
        })
    }
    async revoke(key) {
        await this._db.del(key)
    }
    async ls() {
        return this._db.query((value) => value.type === "authority")
    }
    /**
     * Set json account metadata
     */
    async setMeta(json_content) {
        return await this._db.put({
            _id: "meta",
            type: "meta",
            json_content
        })
    }
    async getMeta() {
        return this._db.get("meta")[0].json_content;
    }
    /* Private methods */
    _onUpdate() {
        this.emit('updated')
    }
    /* Factory */
    static async create(orbitdb, options = {}) {
        const ac = new AuthorityAC(orbitdb, options)
        await ac.load(options.address || options.name || 'default-access-controller')

        // Add write access from options
        if (options.write && !options.address) {
            await pMapSeries(options.write, async (e) => ac.grant('write', e))
        }

        return ac
    }
};
module.exports = AuthorityAC