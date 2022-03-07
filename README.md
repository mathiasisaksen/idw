# <img src="https://raw.githubusercontent.com/mathiasisaksen/idw/main/docs/img/logo-3d.png" style="height:70px"></img>

[![npm version](https://badge.fury.io/js/idw.svg)](https://badge.fury.io/js/idw)

idw is a JavaScript package for flexible interpolation of any-dimensional data using [inverse distance weighting (IDW)](https://en.wikipedia.org/wiki/Inverse_distance_weighting).
It includes functionality for generating tileable noise functions.

This readme contains [examples of use](#examples-of-use), [an API reference](#api) and [an attempt to explain how the package works](#how-nearly-everything-works).

## Installation
The package is available on npm:

```
npm install idw
```

## Examples of use

### One-dimensional function:
In the one-dimensional case, the positions are specified as an array of numbers:
``` js
const { IDW } = require("idw");

const idw = new IDW({
    positions: [0, 0.3, 0.6, 0.8, 1],
    values: [2, 1.3, -0.3, -0.5, 2]
});

// Interpolate at 100 regularly spaced positions between 0 and 1
const x = Array(100).fill().map((_, i) => i / 99);
const values = x.map(p => idw.evaluate(p, 2));
console.log(values); // Outputs array of 100 values [v₁, v₂,...]
```
The second parameter in `idw.evaluate` is the power used when computing the weights.
Here's a comparison using the setup above, with the value of the power above each plot and original data shown as red points:
<p align="center">
    <img src="https://raw.githubusercontent.com/mathiasisaksen/idw/main/docs/img/1d-comparison.svg" style="display:block;max-width:80%;width:750px"></img>
</p>


### Two-dimensional function
Now, the positions are represented as an array of arrays:
``` js
const data = {
    positions: [
        [0.1, 0.3],
        [0.6, 0.5],
        [0.2, 0.8],
        [0.9, 0.1]
    ],
    values: [0, 0.33, 0.67, 1]
}
```
Using the data above, we set up an IDW with tileable edges in the square [0, 1] × [0, 1].
It measures distance using the [Manhattan/taxicab distance](https://en.wikipedia.org/wiki/Taxicab_geometry).
``` js
const { IDW } = require("idw");

const options = { 
    periodicExtent: [[0, 1], [0, 1]] 
}
const idw = new IDW(data, options);
idw.useTaxicabDistance();

// Interpolate at 100 random positions
const positions = Array(100).fill().map(() => [Math.random(), Math.random()]);
const values = positions.map(p => idw.evaluate(p, 3));
console.log(values); // Outputs array of values [v1, v2,...]
```
Here's how the function looks on a 1000 × 1000 grid over [-0.5, 1.5] × [0, 1], with the positions indicated by their index in red:
<p align="center">
    <img src="https://raw.githubusercontent.com/mathiasisaksen/idw/main/docs/img/2d-example-tiled.png" style="display:block;max-width:70%;width:750px"></img>
</p>

The black square indiates `periodicExtent`.

### Three-dimensional function
For the three-dimensional example, we'll use the `generateNoiseIDW` function to generate an `IDW` object with 20 random positions and values.
The positions are sampled from [-1, 1] × [-1, 1] × [0, 1], and the function is tileable/periodic along the z-dimension.
The RNG is specified using a seed value of 1.

``` js
const { generateNoiseIDW } = require("idw");

let idw = generateNoiseIDW({
        n: 20, 
        dimensions: 3, 
        extent: [[-1, 1], [-1, 1], [0, 1]], 
        periodic: [false, false, true]
}, 1);

// Interpolate at 100 random positions inside [-1, 1] × [-1, 1] × [0, 1]
const positions = Array(100).fill().map(() => [-1 + 2*Math.random(), -1 + 2*Math.random(), Math.random()]);
const values = positions.map(p => idw.evaluate(p, 5));
console.log(values); // Outputs array of values [v1, v2,...]
```

The animation below shows the noise function as the z-coordinate increases from 0 to 1.
Since the function is periodic along the z-dimension, it leads to a perfect loop!

<p align="center">
    <a href="https://gfycat.com/likelysnarlingborzoi">
        <img src="https://raw.githubusercontent.com/mathiasisaksen/idw/main/docs/img/3d-example.gif" style="display:block;max-width:30%;width:500px"></img>
    </a>
</p>

## API

### IDW class/prototype

#### **Constructor**

**new IDW(data[, options])**

- *data :*
  - *positions :* The positions of the interpolation data. In the one-dimensional case, this is an array of values (`[x₁, x₂,...]`). Otherwise, it's an an array of arrays (`[[x₁, y₁,...], [x₂, y₂,...], ...]`). Required.
  - *values :* An array of values, in the same order as the associated positions. Required.
- *options :*
  - *periodicExtent :* Specifies the extent of periodicity, if tileability is desired. Expected to be an object mapping dimension to extent, e.g. `{ 0: [-1, 1], 1: [0, 1] }` for the rectangle [-1, 1] × [0, 1]. Defaults to undefined. ([Explanation](#tileable-functions))
  - *innerDistFunction :* The "inner distance function" used when computing the distance between two positions. ([Explanation](#custom-distance-functions))
  - *outerDistFunction :* The "outer distance function" used when computing the distance between two positions. ([Explanation](#custom-distance-functions))
  - *weightFunction :* Function that transforms the values of the weights before computing the weighted average. Expected input is a number between 0 and 1. ([Explanation](#weight-function))
  - *denominatorOffset :* Constant that is added to the denominator when computing the weights (`w = 1/(distanceᵖ + denominatorOffset)`). Defaults to 0.

``` js
const { IDW } = require("idw"); 

const idw = new IDW({
    positions: [0, 0.25, 0.5, 0.75, 1],
    values: [0.1, 0.2, 0.3, 0.4, 0.5]
});
```

``` js
const data = {
    positions: [
        [0, 0.4],
        [0.5, 0.2],
        [0.3, 0.9],
    ],
    values: [-0.5, 1.3, 0.4]
}
const options = {
    periodicExtent: { 0: [0, 1] }, // Tileable only along x-axis
    innerDistFunction: d => Math.exp(d*d) - 1,
    outerDistFunction: arr => Math.log(IDW.sum(arr) + 1),
    weightFunction: w => (1 + Math.sin(4*Math.PI*w)) / 2
}
const idw = new IDW(data, options);
```

#### **idw.evaluate(position, power = 2)**

Computes the interpolated value at a specified position.
`position` is either a number (1D) or an array of same dimension as the elements of `positions` in the input data (>=2D).
`power` is the [power parameter](#the-power-parameter).

``` js
// 1D: Interpolates value at 0.6
const value = idw.evaluate(0.6);
```

``` js
// 2D: Interpolates value at [0.2, 0.5], using p = 3
const value = idw.evaluate([0.2, 0.5], 3);
```

#### **idw.setDistanceFunctions(innerDistFunction, outerDistFunction)**

Sets the `innerDistFunction` and `outerDistFunction` parameters that determine a custom distance function ([see explanation](#custom-distance-functions)).

``` js
// Example: Euclidean distance
idw.setDistanceFunctions((d, i) => d*d, arr => Math.sqrt(IDW.sum(arr));
```

#### **idw.useEuclideanDistance()**

Sets distance functions to compute distance using [Euclidean distance](https://en.wikipedia.org/wiki/Euclidean_distance).
This is the default setup.

``` js
idw.useEuclideanDistance();
```

#### **idw.useTaxicabDistance()**

Sets distance functions to compute distance using [taxicab/Manhattan distance](https://en.wikipedia.org/wiki/Taxicab_geometry).

``` js
idw.useTaxicabDistance();
```

#### **idw.useChessboardDistance()**

Sets distance functions to compute distance using [chessboard/Chebyshev distance](https://en.wikipedia.org/wiki/Chebyshev_distance).

``` js
idw.useChessboardDistance();
```

#### **idw.useMinkowskiDistance(p)**

Sets distance functions to compute distance using [Minkowski distance](https://en.wikipedia.org/wiki/Minkowski_distance).
`p` is the power parameter.

``` js
// Equivalent to taxicab distance
idw.useMinkowskiDistance(1);
```

#### **idw.setWeightFunction(weightFunction)**

Sets the `weightFunction` parameter ([see explanation](#weight-function)).

``` js
idw.setWeightFunction(w => w*w);
```

#### **idw.setDenominatorOffset(denominatorOffset)**

Sets the `denominatorOffset` parameter, a constant that is added to the denominator when computing weights.

``` js
idw.setDenominatorOffset(1e-5);
```

#### **idw.setPeriodicSmoothing(smoothing)**

Using a periodic extent can sometimes lead to strange artifacts in the interpolation function, which can be mitigated by smoothing the distance function.
This method sets the amount of smoothing to use.
`smoothing` must be between 0 and 1, the default value is 0.1.

``` js
idw.setPeriodicSmoothing(0.2);
```

#### **idw.getData()**

Returns the data (object containing `positions` and `values`) that was passed to the constructor.

``` js
const { positions, values } = idw.getData();
```

### **generateNoiseIDW(options[, rng])**

Generates and returns a noise function by creating an IDW object with randomly generated positions and values.

- *options :*
  - *n :* The number of random positions and values to generate for the IDW object, cannot be less than 2. Required.
  - *dimensions :* The dimensionality of the noise function, must be an integer not less than 1. Required.
  - *minValue :* The minimum value for the randomly generated values. Defaults to 0.
  - *maxValue :* The maximum value for the randomly generated values. Defaults to 1.
  - *valueFunction :* Optional function that determines the values based on the generated positions. Defaults to undefined.
  - *extent :* The extent from which to sample the positions. Defaults to "volume" bounded between -1 and 1 along each axis (e.g. the square [-1, 1] × [-1, 1] when `dimensions = 2`)
  - *periodic :* Specifies whether the noise function should be periodic/tileable, either a single boolean or an array of booleans with one value per dimension. Defaults to false.
- *rng :* The random number generator to use. The RNG is responsible for generating the random positions. If `valueFunction` is not specified, it will generate the random values as well. Either an RNG function, or an integer seed value. Defaults to `Math.random`.

By default, the random values are guaranteed to have minimum and maximum values equal to `minValue` and `maxValue`, respectively.
If `valueFunction` is specified, the values for `minValue` and `maxValue` are ignored.

``` js
const { generateNoiseIDW } = require("idw");

const idw = generateNoiseIDW({
    n: 10,
    dimensions: 2,
    minValue: -1,
    maxValue: 1,
    extent: [[-1, 1], [-2, 2]]
}, 123);

console.log(idw.getData()); // The random positions and values generated for the IDW
console.log(idw.evaluate([0, 0])); // Get interpolated value at [0, 0]
```

``` js
const idw = generateNoiseIDW({
    n: 5,
    dimensions: 3,
    valueFunction: p => p[0] + p[1] + p[2] // Value is determined by sum of coordinates
}, 123);

console.log(idw.evaluate([-0.3, 0.5, 0])); // Get interpolated value at [-0.3, 0.5, 0]
```

## How (nearly) everything works

Inverse distance weighting is a method for interpolating data consisting of pairs of positions and values.
It interpolates by computing a weighted average of the supplied values, placing a higher amount of weight on those near the position of interest.

Consider, for example, the data consisting of two-dimensional positions `p₁ = [0, 0]` and `p₂ = [1, 1]` with corresponding values `v₁ = 0` and `v₂ = 1`, and let `p = [0.25, 0.4]` be the position that we want to interpolate.
The distances are `d₁ = distance(p, p1) = √((0 - 0.25)² + (0 - 0.4)²) = 0.472` and `d₂ = distance(p, p2) = 0.960`, leading to weights `w₁ = 1 / d₁ = 2.112` and `w₂ = 1 / d₂ = 1.041`.
The interpolated value is then the weighted average `v = (w₁*v₁ + w₂*v₂) / (w₁ + w₂) = 0.330`.

### The power parameter
In practice, the weights are usually computed as `w = 1 / dᵖ`, where the parameter `p` is a positive number.
The [1D example](#one-dimensional-function) compares interpolation with different values for `p`, and gives some useful intuition.
Using a small value leads to a function that has spikes at the data positions.
As it increases, the function becomes smoother, and eventually flattens out to nearest-neighbor interpolation.
In `idw`, the parameter `p` is specified in the `evaluate` method (see the [API description](#api)).

### Predefined distance functions

The example above measures the distance using the [Euclidean distance](https://en.wikipedia.org/wiki/Euclidean_distance) (i.e. the length of the straight line connecting the positions): 

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`distance([x₁, y₁,...], [x₂, y₂,...]) = √((x₂ - x₁)² + (y₂ - y₁)² + ...)`

where `...` indicates additional coordinates in three or more dimensions.
In addition to this, `idw` offers three predefined distance functions:

[Taxicab/Manhattan distance](https://en.wikipedia.org/wiki/Taxicab_geometry) (`useTaxicabDistance()`):

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`distance([x₁, y₁,...], [x₂, y₂,...]) = |x₂ - x₁| + |y₂ - y₁| + ...`

[Chebyshev/chessboard distance](https://en.wikipedia.org/wiki/Chebyshev_distance) (`useChessboardDistance()`):

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`distance([x₁, y₁,...], [x₂, y₂,...]) = max(|x₂ - x₁|, |y₂ - y₁|,...)`

[Minkowski distance](https://en.wikipedia.org/wiki/Minkowski_distance) (`useMinkowskiDistance(p)`):

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`distance([x₁, y₁,...], [x₂, y₂,...]) = ((x₂ - x₁)ᵖ + (y₂ - y₁)ᵖ + ...)¹ᐟᵖ`

Euclidean distance is the default.

### Custom distance functions

`idw` also allows the user to define their own distance functions through the `innerDistFunction` and `outerDistFunction` parameters.
To understand how this works, first notice that every distance function above can be expressed as

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`distance([x₁, y₁,...], [x₂, y₂,...]) = outerDistFunction([innerDistFunction(x2 - x1), innerDistFunction(y2 - y1),...])`.

Euclidean distance, for example, is

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`innerDistFunction = d => d*d`

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`outerDistFunction = arr => Math.sqrt(IDW.sum(arr))`

where the function `IDW.sum` takes in an array and computes the sum of its elements.

In addition to the coordinate difference, `innerDistFunction` is also passed the coordinate index (0 for x, 1 for y and so on).
This makes it possible to create complex distance functions:

``` js
innerDistFunction = (d, i) => i === 0 ? d*d : Math.abs(d);
```

Specifying custom values for `innerDistFunction` and `outerDistFunction` can lead to very interesting and unpredictable results.


### Tileable functions
The optional parameter `periodicExtent` can be used to create tileable interpolation functions.
The image below demonstrates the situation where `periodicExtent = [[0, 2], [0, 1]]`.

<p align="center">
    <img src="https://raw.githubusercontent.com/mathiasisaksen/idw/main/docs/img/periodic.svg" style="display:block;max-width:70%;width:750px"></img>
</p>

In this case, the rectangle "wraps around", so that the opposite edges are connected, or "glued together".
To better understand how this affects the function, let's compute the distance between the cyan (`[0.2, 0.1]`) and pink (`[1.8, 0.8]`) points.
As always, there's the length of the straight line connecting the points, indicated by a solid blue line.
Its length is `√((1.8 - 0.2)² + (0.8 - 0.1)²) = 1.75`.
However, there's a second straight path connecting the points: moving along the solid brown line, which first crosses the right edge over to the left side, and then from the top to the bottom.
The distance travelled along this path is `√((0.2 + 0.2)² + (0.2 + 0.1)²) = 0.5`, which is also the distance between the points.

When a function has a `periodicExtent` specified, it becomes tileable, meaning that it repeats smoothly across the boundaries.
The [two-dimensional example](#two-dimensional-function) demonstrates this.
Note: It's possible to create functions that are tileable along some boundaries, but not others (see the [API documentation](#api)).

When tileable interpolation functions are evaluated outside `periodicExtent`, the value at the equivalent position inside `periodicExtent` is returned.
In the example above, the position `[2.1, 1.2]` is equivalent to `[0.1, 0.2]`.

### Weight function

The `weightFunction` parameter gives the user another way to modify the behavior of the interpolation function, by transforming the values of the weights before the weighted average is computed.

With data consisting of position-value pairs `(pᵢ, vᵢ)`, the following steps are performed internally:

1. Compute the weight values: `wᵢ = 1 / distance(pᵢ, position)ᵖ`
2. Compute the sum of the weights, and divide each weight by the sum: `wᵢ = wᵢ / sum`
3. Apply weight function to weights: `wᵢ = weightFunction(wᵢ)`
4. Compute and return weighted average of values: `(w₁*v₁ + w₂*v₂ + ...) / (w₁ + w₂ + ...)`

As long as the initial weight values are positive, the inputs to the weight function will always be between 0 and 1.