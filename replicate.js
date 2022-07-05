const axios = require('axios').default;

const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";
const isNode = typeof process !== "undefined" && process.versions != null && process.versions.node != null;

const BASE_URL = "https://api.replicate.com/v1"

const POLLING_INTERVAL = 5000

const sleep = (ms) => new Promise((resolve) => setTimeout(() => resolve(), ms))
class Model {
    constructor(options) {
        if (!options.path)
            throw 'Missing Replicate model path'
        if (!options.httpClient)
            throw 'Missing HTTP Client for Replicate model'
        this.path = options.path;
        this.version = options.version;
        this.httpClient = options.httpClient;
    }

    async getModelDetails() {
        let response = await this.httpClient.get(`/models/${this.path}/versions`);
        let modelVersions = response.data.results;
        let mostRecentVersion = modelVersions[0];
        let explicitlySelectedVersion = modelVersions.find((m) => m.id == this.version);
        this.modelDetails = explicitlySelectedVersion ? explicitlySelectedVersion : mostRecentVersion;
    }

    async *predictor(input) {
        if (!this.modelDetails)
            await this.getModelDetails()
        let startRequest = { "version": this.modelDetails.id, "input": input }
        let startResponse = await this.httpClient.post(`/predictions`, startRequest)
        let predictionStatus;

        do {
            let predictionId = startResponse.data.id;
            let checkResponse = await this.httpClient.get(`/predictions/${predictionId}`)
            predictionStatus = checkResponse.data.status;
            let latestPrediction = checkResponse.data.output;
            await sleep(POLLING_INTERVAL);
            yield latestPrediction;

        } while (['starting', 'processing'].includes(predictionStatus))
    }

    async predict(input) {
        let predictor = this.predictor(input);
        let prediction;
        for await (prediction of predictor) {
            // console.log(prediction);
        }
        return prediction;
    }
}

class Replicate {
    constructor(options) {
        options = options ?? {};
        this.options = options;
        if (isNode && process.env.REPLICATE_API_TOKEN)
            this.token = process.env.REPLICATE_API_TOKEN;
        if (options.token)
            this.token = options.token
        if (!this.token && this.proxy_url)
            throw 'Missing Replicate token'
        this.models = { get: this.getModel.bind(this) }
    }

    async constructHttpClient() {
        //let axios = await this.getNpmModule('axios');
        let proxyPrefix = this.options.proxyUrl ? `${this.options.proxyUrl}/` : '';
        this.httpClient = axios.create({
            baseURL: `${proxyPrefix}${BASE_URL}`,
            headers: { 'Authorization': `Token ${this.token}` }
        });
        console.log(`Constructed httpClient with base url ${proxyPrefix}${BASE_URL}`);
    }
    /*
        async getNpmModule(dependencyName) {
            let location = isBrowser ? `https://cdn.skypack.dev/${dependencyName}` : dependencyName;
            let module = await import(location);
            module = module.default;
            console.log(`Got module ${dependencyName} from ${location}`)
            return module;
        }
    */
    async getModel(path, version) {
        if (!this.httpClient)
            await this.constructHttpClient();
        let model = new Model({ path: path, version: version, httpClient: this.httpClient });
        await model.getModelDetails();
        return model;
    }
}

export default Replicate
