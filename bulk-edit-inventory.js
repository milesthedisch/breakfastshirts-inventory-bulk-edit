const Shopify = require('shopify-api-node');
const path = require('path');
const fs = require('fs-extra');
const flatten = require('lodash.flatten');

const { NAME, API_KEY, PASSWORD } = require('./config.json');
const PRODUCTS_PATH = path.resolve('./products.json');

const shopify = new Shopify({
  shopName: NAME,
  apiKey:  API_KEY,
  password: PASSWORD,
  autoLimit: true
});

shopify.on('callLimits', limits => console.info('LIMIT HIT! ', limits));

const sleep = (time) => new Promise((res, rej) => {
    try {
        setTimeout(() => res('Slept'), time);
    }
    catch (e) {
        rej(e);
    }
});

const inventoryPolicyFilter = (product) =>
    product.variants.filter((variant) => variant.inventory_policy == 'continue');

const productUpdater = (id) => () => shopify.productVariant.update(id, {
    inventory_policy: 'deny'
})

const batchUpdaters = (updaters) => {
    const batches = [];

    let i = -1;

    updaters.forEach((updater, n) => {
        if (n % 20 === 0) {
            i++;
            batches[i] = [];
        }

        batches[i].push(updater);
    });

    return batches;
}

const scheduleUpdaters = async (batches) => {
    let i = 0;

    for (const batch of batches) {
        console.log(`batch ${i++} starting`);

        await Promise.all(batch.map(job => job()));

        console.log(`batch ${i} done`);

        await sleep(2000);

        console.log(`waiting for next batch`);
    }

};


(async () => {
    try {
        if (await fs.pathExists(PRODUCTS_PATH)) {
            console.log('Reading products from json file instead of fetching them...');

            let products = await fs.readJson(PRODUCTS_PATH);

            const filteredProducts = products.map(inventoryPolicyFilter);

            const productIds = flatten(filteredProducts).map(product => product.id);

            const productUpdaters = productIds.map(productUpdater);

            const batches = batchUpdaters(productUpdaters);

            await scheduleUpdaters(batches);

            process.exit(0);
        } else {
            await fs.ensureFile(PRODUCTS_PATH);

            const list = await shopify.product.list();

            await fs.writeJson(path.resolve('./products.json'), list);
        }
    }
    catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
