/**
 * Naive Poisson disk sampling module
 * @module poissimple
 */

/**
 * Poissimple constructor.
 * @param {object} options Sampling options
 * @param {int} options.n The number of points to generate
 * @param {object} [options.dimensions] The dimensionality of the points, defaults to 2
 * @param {Array|Array[]} [options.extent] The extent of the space to sample from, must be either an array of two numbers (1D) or an array of arrays (>=2D), defaults to "volume" bounded between -1 and 1 along each axis
 * @param {boolean|Array} [options.periodic] This parameter specifies whether the algorithm should generate tileable/periodic points. Either a boolean or an array of booleans
 * @param {int} [options.tries] The number of points generated before the algorithm gives up and uses the best candidate, defaults to 30
 * @param {function} [rng] The RNG function used when generating points, defaults to Math.random
 * @constructor
 */
function Poissimple(options, rng = Math.random) {
    // TODO: Constructor should be refactored into methods

    if (typeof options.n !== "number" || options.n < 1) {
        throw new Error("'n' must be an integer greater than 0")
    }
    this.n = options.n;

    // Dimensions specified by user
    const specifiedDim = options.dimensions;
    // Dimensions inferred from extent parameter
    const inferredDim = options.extent === undefined ? undefined :
                        typeof options.extent[0] === "number" ? 1 :
                        options.extent.length;

    if (specifiedDim < 1) throw new Error("'dimensions' must be an integer greater than or equal to 1");

    // Check: Are both dimensions and extent unspecified, or inconsistent?
    // TODO: This is a bit hard to follow, should be refactored
    if (specifiedDim === undefined && inferredDim === undefined) {
        throw new Error("At least one of 'dimensions' and 'extent' must be specified");
    } else if (typeof specifiedDim === "number" && typeof inferredDim === "number" && specifiedDim !== inferredDim) {
        throw new Error("The parameters 'dimensions' and 'extent' are inconsistent");
    } else if (specifiedDim === undefined && inferredDim !== undefined) {
        // If 'dimensions' is unspecified, determine from 'extent'
        this.dim = typeof options.extent[0] === "number" ? 1 : options.extent.length;
    } else if (specifiedDim !== undefined) {
        this.dim = specifiedDim;
    }

    // If the above checks are fruitless, set to default value 2
    this.dim =  this.dim || 2;

    if (this.dim === 1 && options.extent) {
        this.extent = [options.extent];
    } else {
        this.extent = options.extent || Array(this.dim).fill().map(() => [-1, 1]);
    }
    
    this.tries = options.tries || 30;
    this.rng = rng;

    const periodic = options.periodic || false;
    // this.periodic should be on format [boolean, boolean,...] with one entry per dimension
    if (typeof periodic === "boolean") {
        this.periodicArray = Array(this.dim).fill().map(() => periodic);
    } else if (Array.isArray(periodic)) {
        this.periodicArray = periodic;
    } else {
        throw new Error("'periodic' must either be a boolean or an array");
    }
    this.isPeriodic = this.periodicArray.some(v => v);
    
    this._computeExtentVolume();
    this._computeLowerDistance();
    this.points = [];
}

/**
 * Computes the "volume" (length for 1D, area for 2D, volume for >= 3D) of the extent.
 */
Poissimple.prototype._computeExtentVolume = function() {
    let volume = 1;
    this.extent.forEach(bounds => {
        const [lower, upper] = bounds;
        volume *= (upper - lower);
    });
    this.volume = volume;
}

/**
 * Computes the minimum allowed distance between generated points.
 */
 Poissimple.prototype._computeLowerDistance = function() {
    // This heuristic works well for dimensions 1, 2, and 3, no guarantees above that
    this.radius = Math.pow(0.6169 * this.volume / this.n, 1 / this.dim);
}

/**
 * Generates a uniformly sampled position from the extent.
 * @returns {Array} The generated point, represented as an array with length equal to the number of dimensions
 */
Poissimple.prototype._sampleUniform = function() {
    return this.extent.map(bounds => bounds[0] + (bounds[1] - bounds[0])*this.rng());
}

/**
 * Helper function that computes distance between two points (either standard or periodic).
 * @param {Array} point1 The first point
 * @param {Array} point2 The second point
 * @returns {float} The distance between the two points
 */
Poissimple.prototype._distance = function(point1, point2) {
    if (this.dim === 1) {
        point1 = (typeof point1 === "number") ? [point1] : point1;
        point2 = (typeof point2 === "number") ? [point2] : point2;
    }
    return this.isPeriodic ? 
        this._periodicDistance(point1, point2) : 
        this._standardDistance(point1, point2);
}

/**
 * Computes the distance between two points.
 * @param {Array} point1 The first point
 * @param {Array} point2 The second point
 * @returns {float} The distance between the two points
 */
Poissimple.prototype._standardDistance = function(point1, point2) {
    const diffArray = Array(this.dim).fill().map((_, i) => point2[i] - point1[i]);
    return Math.hypot(...diffArray);
}

/**
 * Computes the periodic distance between two points.
 * @param {Array} point1 The first point
 * @param {Array} point2 The second point
 * @returns {float} The distance between the two points
 */
Poissimple.prototype._periodicDistance = function(point1, point2) {
    const ext = this.extent;
    const per = this.periodicArray;

    let diffArray = Array(this.dim).fill().map((_, i) => {
        let d = point2[i] - point1[i];
        
        if (per[i]) {
            const width = ext[i][1] - ext[i][0];
            d = Math.abs(d);
            d = Math.min(d, width - d);
        }
        return d;
    });
    return Math.hypot(...diffArray);
}

/**
 * Computes the distance between a candidate position and the existing positions. If there are no existing positions, Infinity is returned.
 * @param {Array} candidate The candidate point
 * @returns {float} The distance between candidate and the nearest existing point
 */
Poissimple.prototype._distanceToExisting = function(candidate) {
    let minDistance = Infinity;
    this.points.forEach(p => {
        const currentDistance = this._distance(p, candidate);
        minDistance = Math.min(minDistance, currentDistance);
    });
    return minDistance;
}

/**
 * Manually adds a point to the object.
 * @param {float|Array} point The point to add, either a number (1D) or an array of numbers (>1D)
 */
Poissimple.prototype.addPoint = function(point) {
    if (this.dim === 1 && typeof point !== "number") {
        throw new Error("'point' should be a number when sampling in 1D");
    } else if (this.dim > 1 && point.length !== this.dim) {
        throw new Error("'point' has incorrect dimensions");
    }
    this.points.push(point);
}

/**
 * Generates and returns the next point. If n points have already been generated, the returned value is null.
 * @returns {Array|null} The generated position
 */
Poissimple.prototype.next = function() {
    if (this.points.length === this.n) return null;

    let numTries = 0;
    let bestPoint = null;
    let largestDist = -Infinity;

    // Try a set number of times. If a point sufficiently far away from existing
    // points is found, break and add it to the point array. Otherwise, add the point
    // that is farthest away.
    while (numTries < this.tries) {
        const candidate = this._sampleUniform();
        let distToNearest = this._distanceToExisting(candidate);

        if (distToNearest > largestDist) {
            bestPoint = candidate;
            largestDist = distToNearest;
        }
        if (distToNearest > this.radius) break;
        numTries++;
    }
    // If 1D, push value instead of array
    this.points.push(this.dim === 1 ? bestPoint[0] : bestPoint);
    return bestPoint;
}

/**
 * Generates and returns the n points.
 * @returns {Array|Array[]} Array containing the generated points
 */
Poissimple.prototype.fill = function() {
    while (this.points.length < this.n) {
        this.next();
    }
    return this.points;
}

/**
 * Returns the points generated so far.
 * @returns {Array|Array[]}
 */
Poissimple.prototype.getPoints = function() {
    return this.points;
}

/**
 * Resets the state of the object, all generated points are removed.
 */
Poissimple.prototype.reset = function() {
    this.points = [];
}

module.exports = Poissimple;