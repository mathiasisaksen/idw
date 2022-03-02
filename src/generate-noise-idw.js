const Poissimple = require("poissimple");
const IDW = require("./idw.js");

/**
 * Noise function IDW module
 * @module 
 */

/**
 * NoiseIDW constructor. If valueFunction is specified, minValue and maxValue are ignored. Otherwise, the generated values are ensured to have a minimum of minValue and maximum of maxValue.
 * @param {object} options The options used when generating the noise function
 * @param {int} options.n The number of random positions/values to generate for the noise function
 * @param {int} options.dimensions The dimensionality of the noise function
 * @param {float} [options.minValue] The lower bound for the generated values, defaults to 0
 * @param {float} [options.maxValue] The upper bound for the generated values, defaults to 1
 * @param {function} [options.valueFunction] Function used for generating values, with the associated position passed as a parameter, defaults to the parameter 'rng'
 * @param {Array|Array[]} [options.extent] Specifies the extent from which the positions are sampled, defaults to "volume" bounded between -1 and 1 along each axis
 * @param {boolean|Array} [options.periodic] Specifies whether the noise function should be periodic/tileable, either a single boolean or an array of booleans with one value per dimension
 * @param {function} [rng] RNG used for generating the random values (if valueFunction is not specified) and positions 
 * 
 * @constructor
 */
function NoiseIDW(options, rng = Math.random) {
    this.n = options.n;
    if (this.n < 2) throw new Error("n cannot be less than 2.");

    this.dim = options.dimensions;
    this.minValue = options.minValue || 0;
    this.maxValue = options.maxValue || 1;
    this.hasSpecifiedValueFunction = options.valueFunction !== undefined;
    this.valueFunction = options.valueFunction || (() => rng());

    // If one-dimensonal and extent is specified, wrap in outer array
    if (this.dim === 1 && options.extent) {
        this.extent = [options.extent];
    } else {
        this.extent = options.extent || Array(this.dim).fill().map(() => [-1, 1]);
    }

    const periodic = options.periodic || false;
    // this.periodic should be on format [boolean, boolean,...] with one entry per dimension
    if (typeof periodic === "boolean") {
        this.periodic = Array(this.dim).fill().map(() => periodic);
    } else if (Array.isArray(periodic)) {
        this.periodic = periodic;
    } else {
        throw new Error("periodic must either be a boolean or an array");
    }

    this.periodicExtent = {};
    this.periodic.forEach((v, i) => {
        if (!v) return;
        this.periodicExtent[i] = this.extent[i];
    });

    this.rng = rng;

    this._generatePositions();
    this._generateValues();
    this._setupIDW();
}

/**
 * Generates the positions used in the noise function.
 */
NoiseIDW.prototype._generatePositions = function() {
    const positionSampler = new Poissimple({ 
        n: this.n, 
        dimensions: this.dim,
        extent: this.dim === 1 ? this.extent[0] : this.extent,
        periodic: this.periodic
    }, this.rng);

    this.positions = positionSampler.fill();
}

/**
 * Generates the random values associated with each generated position.
 */
NoiseIDW.prototype._generateValues = function() {
    this.values = this.positions.map(p => this.valueFunction(p));
    if (!this.hasSpecifiedValueFunction) {
        const min = this.values.reduce((m, cur) => (m = Math.min(m, cur), m), Infinity);
        const max = this.values.reduce((M, cur) => (M = Math.max(M, cur), M), -Infinity);
        this.values = this.values.map(v => this.minValue + (this.maxValue - this.minValue)*(v - min)/(max - min));
    }
}

/**
 * Uses position and value data to generate IDW object.
 */
NoiseIDW.prototype._setupIDW = function() {
    const data = {
        positions: this.positions,
        values: this.values
    };
    const options = {
        periodicExtent: this.periodicExtent,
    }
    this.idw = new IDW(data, options);
}

/**
 * Generates a noise function 
 * @param {object} options The options used when generating the noise function
 * @param {int} options.n The number of random positions/values to generate for the noise function
 * @param {int} options.dimensions The dimensionality of the noise function
 * @param {float} [options.minValue] The lower bound for the generated values, defaults to 0
 * @param {float} [options.maxValue] The upper bound for the generated values, defaults to 1
 * @param {function} [options.valueFunction] Function used for generating values, with the associated position passed as a parameter, defaults to the parameter 'rng'
 * @param {Array|Array[]} [options.extent] Specifies the extent from which the positions are sampled, defaults to "volume" bounded between -1 and 1 along each axis
 * @param {boolean|Array} [options.periodic] Specifies whether the noise function should be periodic/tileable, either a single boolean or an array of booleans with one value per dimension
 * @param {function} [rng] RNG used for generating the random values (if valueFunction is not specified) and positions 
 * @returns The generated {@link IDW}.
 */
function generateNoiseIDW(options, rng = Math.random) {
    const noiseIDW = new NoiseIDW(options, rng);
    return noiseIDW.idw;
}

module.exports = generateNoiseIDW;