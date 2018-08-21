# irc-json-rpc-filters

Backed by an [irc-block-tracker](https://github.com/AuraMask/irc-block-tracker) and webu provider interface (`webu.currentProvider`).

### supported rpc methods
- `irc_newFilter`
- `irc_newBlockFilter`
- `irc_newPendingTransactionFilter`
- `irc_uninstallFilter`
- `irc_getFilterChanges`
- `irc_getFilterLogs`

### usage

basic usage:
```js
const filterMiddleware = createFilterMiddleware({ blockTracker, provider })
engine.push(filterMiddleware)
```

cleanup:
```js
// remove blockTracker handler to free middleware for garbage collection
filterMiddleware.destroy()
```
