// 图像处理器
function Fip(imageDom, options) {

    // 初始化 --------------------------------------------------------------------------------------

    options = options || {};
    options.sizeLimit = options.sizeLimit || 600;   // 短边最大计算长度(默认600，但不能小于500)
    options.debugging = options.debugging || false; // 调试模式

    var canvasDom = document.createElement('canvas');
    var context = canvasDom.getContext('2d');

    // 缩放图像以减少耗时
    var oWidth = imageDom.naturalWidth, oHeight = imageDom.naturalHeight;
    var shortSide = Math.min(oWidth, oHeight);
    var shrinkScale = shortSide < options.sizeLimit ? 1 : options.sizeLimit / shortSide;
    var width = canvasDom.width = Math.round(oWidth * shrinkScale);
    var height = canvasDom.height = Math.round(oHeight * shrinkScale);
    context.drawImage(imageDom, 0, 0, width, height);

    // 像素计算 ------------------------------------------------------------------------------------

    function getPixelColor(x, y) {
        var pixelData = getPixel(x, y);
        var r = pixelData[0],
            g = pixelData[1],
            b = pixelData[2],
            a = pixelData[3] / 255;
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
    }

    function isPixelBinWhite(x, y) {
        var pixelData = getPixel(x, y);
        var r = pixelData[0],
            g = pixelData[1],
            b = pixelData[2];
        // return r * 0.3 + g * 0.59 + b * 0.11 > 127;
        return r + g + b > 255 * 1.8;
    }

    function isPixelBinBlack(x, y) {
        return !isPixelBinWhite(x, y);
    }

    // 像素缓存 ------------------------------------------------------------------------------------

    var imageData = null;
    var pixelsData = null;

    function getPixels() {
        if (pixelsData) return pixelsData;
        imageData = context.getImageData(0, 0, width, height);
        return pixelsData = imageData.data;
    }

    function getPixel(x, y) {
        var pixels = getPixels();
        var offset = (x + y * width) * 4;
        return [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
    }

    function setPixel(x, y, rgba) {
        if (!pixelsData) return;
        var offset = (x + y * width) * 4;
        for (var i = 0; i < 4; i++) {
            pixelsData[offset + i] = rgba[i];
        }
    }

    function applyData() {
        context.putImageData(imageData, 0, 0);
    }

    // 计时器 --------------------------------------------------------------------------------------

    var timer = {
        startTime: 0,
        start: function () {
            this.startTime = performance.now();
        },
        stop: function () {
            return Math.round(performance.now() - this.startTime) + 'ms';
        },
        log: function (tag) {
            console.log(tag + ' time: ' + this.stop());
        },
    };

    // 全图处理 ------------------------------------------------------------------------------------

    function isPixelDataBlack(pixelData) {
        var sum = pixelData[0] + pixelData[1] + pixelData[2];
        return sum < 255 * 3 * 0.6;
    }

    function isPixelDataWhite(pixelData) {
        return !isPixelDataBlack(pixelData);
    }

    // 二值化
    // throttle 介于0到1之间的阈值
    function binarize(throttle) {
        if (options.debugging) timer.start();
        if (throttle == null) throttle = 0.5;
        for (var i = 0; i < width; i += 1) {
            for (var j = 0; j < height; j += 1) {
                setPixel(i, j, isPixelBinBlack(i, j) ? [0,0,0,255] : [255,255,255,255]);
            }
        }
        applyData();
        if (options.debugging) timer.log('binarize');
        return this;
    }

    // 降噪（二值化后）
    // range: 向外扩展几个像素，默认一个，共3x3=9个像素
    // throttle: 周围像素超过这个百分比的不一致时进行降噪处理，默认0.75
    function denoise(throttle, range) {
        if (options.debugging) timer.start();
        if (throttle == null) throttle = 0.75;
        if (range == null) range = 1;
        for (var i = 0; i < width; i += 1) {
            for (var j = 0; j < height; j += 1) {
                var isCurrBlack = isPixelBinBlack(i, j);
                var analysisResult = this.analysisPixels(this.getSurroundingPixels(i, j, range));
                if (analysisResult.isBlackMore != isCurrBlack) {
                    if (analysisResult.proportionOfMore > throttle) {
                        setPixel(i, j, isCurrBlack ? [255,255,255,255] : [0,0,0,255]);
                    }
                }
            }
        }
        applyData();
        if (options.debugging) timer.log('denoise');
        return this;
    }

    // API属性 -------------------------------------------------------------------------------------

    this.debugging = options.debugging;         // 调试模式
    this.canvasDom = canvasDom;                 // 内部用于图像处理的<canvas>元素
    this.context = context;                     // <canvas>的2D绘图上下文

    this.width = width;                         // 图像宽度
    this.height = height;                       // 图像高度
    this.shortSide = shortSide;                 // 图像短边

    this.originalWidth = oWidth;                // 原始图像宽度
    this.originalHeight = oHeight;              // 原始图像高度

    // API方法 -------------------------------------------------------------------------------------

    this.getPixel = getPixel;
    this.getPixelColor = getPixelColor;         // 获取像素颜色(rgba格式)
    this.isPixelBinBlack = isPixelBinBlack;     // 判断像素二值化后是否是黑色
    this.isPixelBinWhite = isPixelBinWhite;     // 判断像素二值化后是否是白色
    this.isPixelDataBlack = isPixelDataBlack;   // 判断像素数据二值化后是否是黑色
    this.isPixelDataWhite = isPixelDataWhite;   // 判断像素数据二值化后是否是白色

    this.binarize = binarize;                   // 二值化处理
    this.denoise = denoise;                     // 降噪处理
}

// 外部方法 ----------------------------------------------------------------------------------------

Fip.prototype = {

    calcColBlackLineCount: function (x) {
        var count = 0;
        var currIsBlack = false,
            lastIsBlack = false;
        for (var i = 0; i < this.height; i += 1) {
            currIsBlack = this.isPixelBinBlack(x, i);
            if (currIsBlack && !lastIsBlack) {
                count += 1;
            }
            lastIsBlack = currIsBlack;
        }
        return count;
    },

    calcRowBlackLineCount: function (y) {
        var count = 0;
        var currIsBlack = false,
            lastIsBlack = false;
        for (var i = 0; i < this.width; i += 1) {
            currIsBlack = this.isPixelBinBlack(i, y);
            if (currIsBlack && !lastIsBlack) {
                count += 1;
            }
            lastIsBlack = currIsBlack;
        }
        return count;
    },

    // 获取周围像素
    getSurroundingPixels: function (x, y, range) {
        if (range == null) range = 1;
        var pixels = [];
        for (var i = -range; i <= range; i += 1) {
            for (var j = -range; j <= range; j += 1) {
                if ((i != 0 || j != 0)
                    && x + i >= 0 && x + i < this.width
                    && y + j >= 0 && y + j < this.height
                ) {
                    pixels.push(this.getPixel(x + i, y + j));
                }
            }
        }
        return pixels;
    },

    // 分析一组像素：大部分是黑色还是白色、大部分所占比例
    analysisPixels: function (pixels) {
        var blackCount = 0,
            whiteCount = 0;
        for (var k = 0; k < pixels.length; k += 1) {
            this.isPixelDataWhite(pixels[k]) ? whiteCount += 1 : blackCount += 1;
        }
        return {
            isBlackMore: blackCount > whiteCount,
            isWhiteMore: blackCount < whiteCount,
            proportionOfMore: Math.max(blackCount, whiteCount) / (blackCount + whiteCount),
        }
    },
};
