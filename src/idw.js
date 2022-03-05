/**
 * Inverse distance weighting module
 * @module idw
 */

/**
 * IDW constructor. Unless custom functions are supplied in the options parameters, the distance between two positions will be computed using the Euclidean distance.
 * @param {object} data The data to be interpolated
 * @param {Array|Array[]} data.positions Contains the positions of the data, in the format [[x1, y1,...], [x2, y2,...],...]
 * @param {Array} data.values Contains the values at each position
 * @param {object} [options] Options that determine the behaviour of the IDW interpolation 
 * @param {object} [options.periodicExtent] Specifies the extent of periodicity, if tileability is desired (see documentation), defaults to undefined
 * @param {function} [options.innerDistFunction] Function that is applied to each difference x2 - x1, y2 - y1,... when computing the distance between two points, defaults to d => d*d
 * @param {function} [options.outerDistFunction] Function that is applied to the sum of the differences when computing the distance between two points, should always return a non-negative value, defaults to Math.sqrt
 * @param {function} [options.weightFunction] The function that transforms the weight values before computing the weighted average, should expect inputs between 0 and 1 (unless strange distance functions are used)
 * @param {function} [options.denominatorOffset] Number that is added to the denominator when computing weights, defaults to 0
 * @constructor
 */
function IDW(data, options) {
    options = options || {};
    const { positions, values } = data;
    if (positions.length !== values.length) throw new Error("positions and values must have the same length");

    this.dim = typeof positions[0] === "number" ? 1 : positions[0].length;
    this.positions =  this.dim === 1 ? positions.map(v => [v]) : positions;
    this.values = values;
    this.n = values.length;
    
    this.extent = options.periodicExtent;
    this.isPeriodic = options.periodicExtent !== undefined;

    this.innerDistFunction = options.innerDistFunction || (d => d*d);
    this.outerDistFunction = options.outerDistFunction || (arr => Math.sqrt(IDW.sum(arr)));
    this.weightFunction = options.weightFunction || (w => w);
    this.denominatorOffset = options.denominatorOffset || 0;

    Object.assign(this, options);
    this.hasCustomWeightFunction = options.weightFunction ? true : false;

    if (this.isPeriodic) this._validatePeriodicPositions();
    this.setPeriodicSmoothing(0.05);

}

/**
 * Ensures that the specified positions are inside the bounds given in the periodic extent.
 */
IDW.prototype._validatePeriodicPositions = function() {
    const ext = this.extent;
    this.positions.forEach(p => {
        p.forEach((coordinate, i) => {
            if (ext[i] === undefined) return;
            if (!(coordinate >= ext[i][0] && coordinate <= ext[i][1])) {
                throw new Error(`Position at index ${i} is outside the bounds specified in periodicExtent.`);
            }
        });
    });
}

/**
 * Maps positions inside the extent in a periodic manner.
 * @param {Array} position The position to be mapped
 */
IDW.prototype._mapPeriodically = function(position) {
    const ext = this.extent;
    position = position.map((coordinate, i) => {
        // If no bounds are specified for current coordinate, no transformation is necessary
        if (ext[i] === undefined) return coordinate;
        const [lower, upper] = ext[i];
        // Transform to [0, 1]
        let normCoord = (coordinate - lower) / (upper - lower);
        // Subtract floor to bring inside [0, 1]
        normCoord -= Math.floor(normCoord);
        // Transform back to [lower, upper]
        return lower + (upper - lower)*normCoord;
    });
    return position;
}



/** 
 * Sets the inner and outer distance functions.
 * The distance between two points [x1, y1,...] and [x2, y2,...] is computed as
 * outerDistFunction([innerDistFunction(x2 - x1), innerDistFunction(y2 - y1),...])
 * 
 * In other words, the innerDistFunction is applied to the individual coordinate differences between the two positions,
 * and the outerDistFunction reduces the array of these transformed differences to a single value.
 * By default, Euclidean distance is used (https://en.wikipedia.org/wiki/Euclidean_distance): 
 *     innerDistFunction = d => d * d
 *     outerDistFunction = arr => Math.sqrt(IDW.sum(arr))
 * 
 * Examples of other distance functions:
 * 
 * Taxicab/Manhattan distance (https://en.wikipedia.org/wiki/Taxicab_geometry):
 *     innerDistFunction = d => Math.abs(d)
 *     outerDistFunction = arr => IDW.sum(arr)
 * 
 * Chessboard/Chebyshev distance (https://en.wikipedia.org/wiki/Chebyshev_distance): 
 *     innerDistFunction = Math.abs
 *     outerDistFunction = arr => Math.max(...arr)
 * 
 * Minkowski/Lp distance (https://en.wikipedia.org/wiki/Minkowski_distance):
 *     innerDistFunction = d => Math.pow(d, power)
 *     outerDistFunction = arr => Math.pow(IDW.sum(arr), 1 / power)
 * 
 * @param {function} innerDistFunction The inner distance function
 * @param {function} outerDistFunction The outer distance function
 */
IDW.prototype.setDistanceFunctions = function(innerDistFunction, outerDistFunction) {
    if (typeof innerDistFunction !== "function") throw new Error("innerDistFunction must be a function");
    if (typeof outerDistFunction !== "function") throw new Error("outerDistFunction must be a function");
    this.innerDistFunction = innerDistFunction;
    this.outerDistFunction = outerDistFunction;
}

/**
 * Use the Euclidean distance (https://en.wikipedia.org/wiki/Euclidean_distance):
 * distance(p1, p2) = sqrt((x2 - x1)^2 + (y2 - y1)^2 + ...)
 */
IDW.prototype.useEuclideanDistance = function() {
    this.setDistanceFunctions(d => d * d, arr => Math.sqrt(IDW.sum(arr)));
}

/**
 * Use the taxicab/Manhattan distance (https://en.wikipedia.org/wiki/Taxicab_geometry):
 * distance(p1, p2) = |x2 - x1| + |y2 - y1| + ...
 */
IDW.prototype.useTaxicabDistance = function() {
    this.setDistanceFunctions(Math.abs, IDW.sum);
}

/**
 * Use the chessboard/Chebyshev distance (https://en.wikipedia.org/wiki/Chebyshev_distance):
 * distance(p1, p2) = max(|x2 - x1|, |y2 - y1|, ...)
 */
IDW.prototype.useChessboardDistance = function() {
    this.setDistanceFunctions(Math.abs, arr => Math.max(...arr));
}

/**
 * Use the Minkowski/Lp distance (https://en.wikipedia.org/wiki/Minkowski_distance):
 * distance(p1, p2) = ((x2 - x1)^p + (y2 - y1)^p + ...)^(1 / p)
 * @param {float} power The value for the parameter p in the expression above
 */
IDW.prototype.useMinkowskiDistance = function(power = 2) {
    this.setDistanceFunctions(d => Math.pow(d, power), arr => Math.pow(IDW.sum(arr), 1 / power));
}

/**
 * Sets the function that transforms the weight values before computing the weighted average, 
 * should expect inputs between 0 and 1 (unless strange distance functions are used)
 * @param {function} weightFunction The weight function
 */
IDW.prototype.setWeightFunction = function(weightFunction) {
    if (typeof weightFunction !== "function") throw new Error("weightFunction must be a function");
    this.weightFunction = weightFunction;
    this.hasCustomWeightFunction = true;
}

/**
 * Sets the denominator offset, which is the value added to the denominator when computing the weights:
 *     w_i = 1 / (distance(p_i, position)^p + denominatorOffset)
 * The default value is 0.
 * @param {float} denominatorOffset The value of the denominator offset
 */
 IDW.prototype.setDenominatorOffset = function(denominatorOffset) {
    if (typeof denominatorOffset !== "number") throw new Error("denominatorOffset must be a number");
    this.denominatorOffset = denominatorOffset;
}

/**
 * Sets the amount of smoothing applied to the distance function when a periodic boundary is used, defaults to 0.05.
 * @param {*} smoothing The amount of smoothing, must be between 0 and 1
 */
IDW.prototype.setPeriodicSmoothing = function(smoothing) {
    if (typeof smoothing !== "number") throw new Error("smoothing must be a number");
    if (!(smoothing >=0 && smoothing <= 1)) throw new Error("smoothing must be between 0 and 1");
    this.periodicSmoothing = smoothing;
}

/**
 * Computes the distance between two positions p1 and p2. Note: The distance depends on innerDistFunction and outerDistFunction.
 * @param {Array} p1 Coordinates of first position 
 * @param {Array} p2 Coordinates of second position
 * @returns {float} The distance between p1 and p2
 */
IDW.prototype._distance = function(p1, p2) {
    if (this.dim === 1) {
        // Ensure that position is contained in array
        p1 = (typeof p1 === "number") ? [p1] : p1;
        p2 = (typeof p2 === "number") ? [p2] : p2;
    }

    if (this.isPeriodic) {
        return this._periodicDistance(p1, p2);
    } else {
        return this._standardDistance(p1, p2);
    }
    
}

IDW.prototype._standardDistance = function(p1, p2) {
    let diffArray = Array(this.dim).fill().map((_, i) => {
        let d = p2[i] - p1[i];
        return this.innerDistFunction(d);
    });
    return this.outerDistFunction(diffArray);
}

IDW.prototype._periodicDistance = function(p1, p2) {
    p1 = this._mapPeriodically(p1);
    p2 = this._mapPeriodically(p2);

    const ext = this.extent;

    let diffArray = Array(this.dim).fill().map((_, i) => {
        let d = p2[i] - p1[i];
        
        if (ext[i] !== undefined) {
            const width = ext[i][1] - ext[i][0];
            d = Math.abs(d);
            d = Math.min(d, width - d);

            const w = this.periodicSmoothing;
            // Maximum distance is width / 2 –> d / (width / 2) rescales to [0, 1]
            d = width / 2 * IDW._squareEase(d / (width / 2), w, w);
        }

        return this.innerDistFunction(d);
    });
    return this.outerDistFunction(diffArray);
}

/**
 * Normalizes an array of numbers to have a sum equal to 1.
 * @param {Array} values The array of values to be normalized
 * @returns {Array} The normalized array
 */
IDW._normalizeValues = function(values) {
    const sum = IDW.sum(values);
    return values.map(v => v / sum);
}

/**
 * Computes the sum of an array of numbers.
 * @param {Array} values The array of numbers to be summed
 * @returns {float} The sum of the array
 */
IDW.sum = function(values) {
    return values.reduce((sum, cur) => (sum += cur, sum), 0);
}

/**
 * Easing function that is linear except at the start and end of the interval.
 * [0, 1], where quadratic polynomials are used to make the function smoothly flatten out.
 * The sum of wStart and wEnd cannot exceed 1.
 * For 0 < value <= wStart, the function is a quadratic on the form a*value^2.
 * For wStart < value <= 1 - wEnd, the function is linear on the form m*value + k.
 * For 1 - wEnd < value <= 0, the function is a quadratic on the form a*(1 - value)^2 + 1.
 * @param {float} value The value to be eased
 * @param {float} wStart The "width" of the starting quadratic portion
 * @param {float} wEnd The "width" of the ending quadratic portion
 * @returns {float} Eased value
 */
IDW._squareEase = function(value, wStart = 0.05, wEnd = 0.05) {
    if (wStart + wEnd > 1) throw new Error("The sum of wStart and wEnd cannot exceed 1");
    if (value <= 0) return 0;
    if (value > 1) return 1;
    
    // Value common to every case
    const common = 1/(2 - (wStart + wEnd)); 

    // Start quadratic portion
    if (value > 0 && value <= wStart) {
        const a = common/wStart; // Coefficient in a*x^2
        return a*value*value;
    }

    // Central linear part
    if (value > wStart && value <= 1 - wEnd) {
        const m = 2*common; // Slope
        const k = - wStart*common; // Intercept
        return m*value + k;
    }

    // End quadratic portion
    if (value > 1 - wEnd && value <= 1) {
        const a = - common/wEnd; // Coefficient in a*(1 - x)^2 + 1
        return a*(1 - value)*(1 - value) + 1;
    }

    // Otherwise, return 1
    return 1;
}

/**
 * Returns the positions and values used for the IDW.
 * @returns {object} Object containing positions and values
 */
IDW.prototype.getData = function() {
    return { positions: this.positions, value: this.value };
}

/**
 * Performs inverse distance weighting in a specified position.
 * @param {Array} position The position of interest
 * @param {float} power The power used when computing the weights, defaults to 2
 * @returns {float} The interpolated value
 */
IDW.prototype.evaluate = function(position, power = 2) {
    let weights = Array(this.n).fill();

    // For each position p_i in original data, compute weight w_i = 1 / (distance(position, p_i)^p + denominatorOffset)
    this.positions.forEach((p, i) => {
        const dist = this._distance(position, p);
        weights[i] = 1 / (Math.pow(dist, power) + this.denominatorOffset); 
    });
    
    // Weights must be normalized both before and after transformation by weight function
    weights = IDW._normalizeValues(weights);

    // If custom weight function has been supplied: Transform weights to new values
    if (this.hasCustomWeightFunction) weights = weights.map(w => this.weightFunction(w));

    // Just in case: If a weight is non-finite, return the corresponding value. 
    // This is a hacky solution, what if the weight is negative infinity?
    for (let i = 0; i < weights.length; i++) {
        if (!Number.isFinite(weights[i])) return this.values[i];
    }

    // Renormalize after transformation
    if (this.hasCustomWeightFunction) weights = IDW._normalizeValues(weights);
    
    // Compute weighted average w_1*z_1 + ... + w_n*z_n
    let weightedAverage = weights.reduce((sum, w, i) => (sum += w * this.values[i], sum), 0);
    return weightedAverage;
}

module.exports = IDW;