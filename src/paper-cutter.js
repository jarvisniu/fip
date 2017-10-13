// 手动切图程序
// @author 牛俊为
// @created 2017/06/03
//
// Usage:
// var paperCutter = new PaperCutter(imageDom, {
//     onchange: function,  // 当切图有变化时的回调
//     autoReload: bool,    // 是否监视<img>的load，默认为 false
//     debug: bool,         // 是否打印调试日志，默认为 false
// });
//
// API:
// .cutToDataUrls() // 返回一个切分后的题块的 DataURL 数组
// .cutToBlobs()    // 返回一个切分后的题块的 Blob 数组
// .destroy()       // 清理操作

function PaperCutter(imageDom, options) {
    if (typeof imageDom === 'string') {
        imageDom = document.querySelector(imageDom);
    }
    options = options || {};

    // 常量
    var DEFAULT_PADDING = 100,          // 默认边距，即竖线距离图像边缘的距离
        HOVER_LIMIT = 4,                // 判断鼠标靠近横线或竖线的阈值
        DASH_STYLE = [6, 9];            // 默认虚线样式
    var BUTTON_WIDTH = 20,              // 切换按钮宽度
        BUTTON_HEIGHT = 20,             // 切换按钮高度
        BUTTON_MARGIN = 5;              // 切换按钮边距


    // 鼠标状态枚举
    var MOUSE_STATUS = {
        OUT: 0,                     // 鼠标不在左右竖线之内
        ADDING_COL: 1,              // 增加列的右边线
        ADDING_BLOCK: 2,            // 增加块的底线
        TOGGLING_BLOCK: 3,          // 切换块的删除
        MOVING_HEADER: 8,           // 移动顶线
        MOVING_FOOTER: 9,           // 移动底线
        MOVING_PADDING_LEFT: 4,     // 移动左竖线
        MOVING_PADDING_RIGHT: 5,    // 移动右竖线
        MOVING_X: 6,                // 移动竖线
        MOVING_Y: 7,                // 移动横线
    };
    var MOUSE_CURSOR = {
        '0': 'default',
        '1': 'crosshair',
        '2': 'crosshair',
        '3': 'pointer',
        '4': 'ew-resize',
        '5': 'ew-resize',
        '6': 'ew-resize',
        '7': 'ns-resize',
        '8': 'ns-resize',
        '9': 'ns-resize',
    };

    var canvasDom = document.createElement('canvas');
    var context = canvasDom.getContext('2d');
    var canvasWidth, canvasHeight;
    var padding = {
        leftX: DEFAULT_PADDING,
        topY: DEFAULT_PADDING,
        rightX: 0,
        bottomY: 0,
    };
    var blocks = [[]];
    var rafRender;

    var imageProcessor;

    imageDom.style.display = 'block'; // <img>的display默认为inline，这会在容器下方留下4px的空白

    imageDom.addEventListener('load', init);

    // 如果已经加载好了，直接初始化
    if (imageDom.complete && imageDom.naturalWidth > 0) init();

    // console.log(imageDom.complete, imageDom.naturalWidth);

    function init() {
        destroy();
        blocks = [[]];

        imageProcessor = new Fip(imageDom);

        canvasDom.style.position = 'absolute';
        canvasDom.style.left = '0';
        canvasDom.style.top = '0';
        canvasDom.style.width = '100%';
        canvasDom.style.userSelect = 'none';
        imageDom.parentElement.appendChild(canvasDom);

        onResize();

        var detectedPadding = imageProcessor.findPadding();
        padding.leftX = canvasWidth * detectedPadding.left;
        padding.topY = canvasHeight * detectedPadding.top;
        padding.rightX = canvasWidth * detectedPadding.right;
        padding.bottomY = canvasHeight * detectedPadding.bottom;

        // padding.rightX = canvasWidth - DEFAULT_PADDING;
        // padding.bottomY = canvasHeight - DEFAULT_PADDING;

        var detectedGap = imageProcessor.findGap();
        if (detectedGap != null) {
            blocks.push([]);
            blocks[0].rightX = Math.round(canvasWidth * detectedGap.middle);
        }

        blocks.forEach(function (col) {
            col.push({
                bottomY: padding.bottomY,
            });
        });

        syncPaddingRight();

        triggerChange();

        canvasDom.addEventListener('mousedown', onMouseDown);
        canvasDom.addEventListener('mousemove', onMouseMove);
        canvasDom.addEventListener('mouseup', onMouseUp);
        canvasDom.addEventListener('mouseleave', onMouseLeave);
        canvasDom.addEventListener('contextmenu', onContextMenu);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', onResize);

        rafRender = requestAnimationFrame(render);

        if (!options.autoReload) imageDom.removeEventListener('load', init);
    }

    function syncCanvas() {
        canvasWidth = canvasDom.width = parseFloat(getComputedStyle(imageDom).width);
        canvasHeight = canvasDom.height = parseFloat(getComputedStyle(imageDom).height);
        canvasDom.style.height = canvasHeight + 'px';
    }

    function onResize() {
        var oldWidth = canvasWidth;
        syncCanvas();
        var scale = canvasWidth / oldWidth;
        padding.leftX *= scale;
        padding.rightX *= scale;
        padding.topY *= scale;
        padding.bottomY *= scale;
        blocks.forEach(function (col) {
            col.forEach(function (block) {
                block.bottomY *= scale;
            });
            col.rightX *= scale;
        });
    }

    function destroy() {
        cancelAnimationFrame(rafRender);

        canvasDom.removeEventListener('mousedown', onMouseDown);
        canvasDom.removeEventListener('mousemove', onMouseMove);
        canvasDom.removeEventListener('mouseup', onMouseUp);
        canvasDom.removeEventListener('mouseleave', onMouseLeave);
        canvasDom.removeEventListener('contextmenu', onContextMenu);
        document.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', onResize);
    }

    var mouseInfo = {
        down: false,
        x: -1,
        y: -1,
        status: MOUSE_STATUS.OUT,
        hoveringColLineIndex: -1,
        hoveringColBodyIndex: -1,
        hoveringBlockLineIndex: -1,
        hoveringBlockBodyIndex: -1,
        calcStatus: function () {
            this.hoveringColLineIndex = this.pickColLineIndex();
            this.hoveringColBodyIndex = this.pickColBodyIndex();
            this.hoveringBlockLineIndex = this.pickBlockLineIndex(this.hoveringColBodyIndex);
            this.hoveringBlockBodyIndex = this.pickBlockIndex(this.hoveringColBodyIndex);
            if (this.hoveringBlockLineIndex > -1) this.hoveringBlockBodyIndex = -1;
            this.hoveringToggleButton = this.pickToggleButton();

            if (isNear(padding.leftX, this.x)) {
                this.status = MOUSE_STATUS.MOVING_PADDING_LEFT;
            } else if (isNear(padding.rightX, this.x)) {
                this.status = MOUSE_STATUS.MOVING_PADDING_RIGHT;
            } else if (isNear(padding.topY, this.y)) {
                this.status = MOUSE_STATUS.MOVING_HEADER;
            } else if (isNear(padding.bottomY, this.y)) {
                this.status = MOUSE_STATUS.MOVING_FOOTER;
            } else if (this.x < padding.leftX - HOVER_LIMIT || this.x > padding.rightX + HOVER_LIMIT) {
                this.status = MOUSE_STATUS.OUT;
            } else if (this.hoveringColLineIndex > -1) {
                this.status = MOUSE_STATUS.MOVING_X;
            } else if (this.y < padding.topY - HOVER_LIMIT || this.y > padding.bottomY + HOVER_LIMIT) {
                this.status = MOUSE_STATUS.ADDING_COL;
            } else if (this.hoveringBlockLineIndex > -1) {
                this.status = MOUSE_STATUS.MOVING_Y;
            } else if (this.hoveringBlockBodyIndex > -1) {
                if (!this.hoveringToggleButton)
                    this.status = MOUSE_STATUS.ADDING_BLOCK;
                else
                    this.status = MOUSE_STATUS.TOGGLING_BLOCK;
            } else if (this.hoveringColBodyIndex > -1) {
                if (!this.hoveringToggleButton)
                    this.status = MOUSE_STATUS.ADDING_BLOCK;
                else
                    this.status = MOUSE_STATUS.TOGGLING_BLOCK;
            } else {
                this.status = MOUSE_STATUS.OUT;
            }
            refreshCursor();
        },
        pickColLineIndex: function () {
            for (var i = 0; i < blocks.length - 1; i++) {
                if (isNear(this.x, blocks[i].rightX)) {
                    return i;
                }
            }
            return -1;
        },
        pickColBodyIndex: function () {
            if (this.x < padding.leftX || this.x > padding.rightX) return -1;
            for (var i = 0; i < blocks.length; i++) {
                if (this.x < blocks[i].rightX) {
                    return i;
                }
            }
            return -1;
        },
        pickBlockLineIndex: function (j) {
            if (j < 0) return -1;
            for (var i = 0; i < blocks[j].length; i++) {
                if (isNear(blocks[j][i].bottomY, this.y)) {
                    return i;
                }
            }
            return -1;
        },
        pickBlockIndex: function (j) {
            if (j === -1 || this.y < padding.topY) return -1;
            for (var i = 0; i < blocks[j].length; i++) {
                if (this.y < blocks[j][i].bottomY) {
                    return i;
                }
            }
            return -1;
        },
        pickToggleButton: function () {
            var i = mouseInfo.hoveringColBodyIndex;
            var j = mouseInfo.hoveringBlockBodyIndex;
            if (i < 0 || j < 0) return false;

            var gtLeft = this.x > blocks[i].rightX - BUTTON_WIDTH - BUTTON_MARGIN,
                ltRight = this.x < blocks[i].rightX - BUTTON_MARGIN,
                gtTop = this.y > getBlockTop(i, j) + BUTTON_MARGIN,
                ltBottom = this.y < getBlockTop(i, j) + BUTTON_HEIGHT + BUTTON_MARGIN;
            return gtLeft && ltRight && gtTop && ltBottom;
        },
    };

    function onMouseDown(ev) {
        mouseInfo.down = true;
        mouseInfo.calcStatus();
        if (ev.button === 1) {
            ev.preventDefault(); // 取消中键的默认功能（屏幕滚动）
        } else if (mouseInfo.status === MOUSE_STATUS.ADDING_COL) {
            var j = mouseInfo.hoveringColBodyIndex;
            blocks[j].length = 1;
            blocks[j].lastRemoved = false;
            var newCol = [{}];
            newCol.rightX = mouseInfo.x;
            blocks.splice(j, 0, newCol);
            syncPaddingBottom();
            mouseInfo.calcStatus();
        } else if (mouseInfo.status === MOUSE_STATUS.ADDING_BLOCK) {
            blocks[mouseInfo.hoveringColBodyIndex].push({
                bottomY: ev.offsetY,
                removed: ev.button === 2,
            });
            mouseInfo.calcStatus();
        } else if (mouseInfo.status === MOUSE_STATUS.TOGGLING_BLOCK) {
            var col = blocks[mouseInfo.hoveringColBodyIndex];
            var idx = mouseInfo.hoveringBlockBodyIndex;
            col[idx].removed = !col[idx].removed;
        }
    }

    function onMouseMove(ev) {
        mouseInfo.x = ev.offsetX;
        mouseInfo.y = ev.offsetY;
        if (mouseInfo.down) {
            if (mouseInfo.status === MOUSE_STATUS.MOVING_PADDING_LEFT) {
                padding.leftX += ev.movementX;
            } else if (mouseInfo.status === MOUSE_STATUS.MOVING_PADDING_RIGHT) {
                padding.rightX += ev.movementX;
                syncPaddingRight();
            } else if (mouseInfo.status === MOUSE_STATUS.MOVING_HEADER) {
                padding.topY += ev.movementY;
            } else if (mouseInfo.status === MOUSE_STATUS.MOVING_FOOTER) {
                padding.bottomY += ev.movementY;
                syncPaddingBottom();
            } else if (mouseInfo.status === MOUSE_STATUS.MOVING_X) {
                blocks[mouseInfo.hoveringColLineIndex].rightX += ev.movementX;
            } else if (mouseInfo.status === MOUSE_STATUS.MOVING_Y) {
                blocks[mouseInfo.hoveringColBodyIndex][mouseInfo.hoveringBlockLineIndex].bottomY += ev.movementY;
            }
        } else {
            mouseInfo.calcStatus();
        }
    }

    function onMouseUp(ev) {
        mouseInfo.down = false;
        if (mouseInfo.status === MOUSE_STATUS.MOVING_X) {
            // 移动分栏切割线，如果移除左右边距则删除之
            var lineX = blocks[mouseInfo.hoveringColLineIndex].rightX;
            if (lineX > padding.rightX || lineX < padding.leftX) {
                var deletingColIndex = mouseInfo.hoveringColLineIndex;
                if (lineX < padding.leftX) {
                    blocks.splice(mouseInfo.hoveringColLineIndex, 1);
                } else { // 如果往右拖，删除右边这列
                    blocks.splice(mouseInfo.hoveringColLineIndex + 1, 1);
                    syncPaddingRight();
                }
                mouseInfo.calcStatus();
                mouseInfo.hoveringColLineIndex = -1;
            }
        } else if (mouseInfo.status === MOUSE_STATUS.MOVING_Y) {
            // 允许交换题块底线，可能需要重新排序
            var j = mouseInfo.hoveringColBodyIndex,
                col = blocks[j];
            blocks[j] = col.sort(function (a, b) {
                return a.bottomY - b.bottomY
            });
            // 如果拖出上下边界，则将至删除。这里不能把 col.length 合起来！
            if (col.length && col[0].bottomY < padding.topY) col.splice(0, 1);
            if (col.length && col[col.length - 1].bottomY > padding.bottomY) col.splice(col.length - 1, 1);
        } else if (mouseInfo.status === MOUSE_STATUS.MOVING_HEADER) {
            // 移动边线有可能吃掉部分题块
            for (var j = 0; j < blocks.length; j++) {
                var col = blocks[j];
                for (var i = col.length - 1; i > -1; i--) {
                    if (col[i].bottomY < padding.topY) {
                        col.splice(0, i + 1);
                        break;
                    }
                }
            }
        } else if (mouseInfo.status === MOUSE_STATUS.MOVING_FOOTER) {
            for (var j = 0; j < blocks.length; j++) {
                var col = blocks[j];
                for (var i = 0; i < col.length; i++) {
                    if (col[i].bottomY > padding.bottomY) {
                        col.splice(i);
                        break;
                    }
                }
            }
        } else if (mouseInfo.status === MOUSE_STATUS.MOVING_PADDING_LEFT) {
            for (var j = 1; j < blocks.length; j++) {
                if (padding.leftX > blocks[j - 1].rightX && padding.leftX < blocks[j].rightX) {
                    blocks.splice(0, j);
                    break;
                }
            }
        } else if (mouseInfo.status === MOUSE_STATUS.MOVING_PADDING_RIGHT) {
            var cuttingIndex = blocks.length;
            for (var j = blocks.length - 2; j >= 0; j--) {
                if (padding.rightX < blocks[j].rightX) {
                    cuttingIndex = j + 1;
                }
            }
            blocks.splice(cuttingIndex);
            syncPaddingRight();
        }
        triggerChange();
    }

    function onMouseLeave(ev) {
        mouseInfo.status = MOUSE_STATUS.OUT;
    }

    function onKeyDown(ev) {
        var key = ev.key || ev.keyIdentifier;
        if (key == 'Delete' || key == 'Backspace') {
            if (mouseInfo.hoveringBlockLineIndex > -1) {
                blocks[mouseInfo.hoveringColBodyIndex].splice(mouseInfo.hoveringBlockLineIndex, 1);
                mouseInfo.calcStatus();
                triggerChange();
            } else if (mouseInfo.hoveringColLineIndex > -1) {
                blocks[mouseInfo.hoveringColLineIndex + 1].length = 0;
                blocks.splice(mouseInfo.hoveringColLineIndex, 1);
                mouseInfo.calcStatus();
                triggerChange();
            }
        }
    }

    function onContextMenu(ev) {
        ev.preventDefault();
    }

    function triggerChange() {
        if (options.onchange) options.onchange();
    }

    function isNear(a, b) {
        return Math.abs(a - b) < HOVER_LIMIT;
    }

    function getColBottomY(j) {
        if (blocks[j].length > 0)
            return blocks[j][blocks[j].length - 1].bottomY;
        else
            return padding.topY;
    }

    function getColLeft(idx) {
        return !idx ? padding.leftX : blocks[idx - 1].rightX;
    }

    function getBlockTop(j, idx) {
        return idx == 0 ? padding.topY : blocks[j][idx - 1].bottomY;
    }

    function refreshCursor() {
        canvasDom.style.cursor = MOUSE_CURSOR[mouseInfo.status];
    }

    function syncPaddingRight() {
        blocks[blocks.length - 1].rightX = padding.rightX;
    }

    function syncPaddingBottom() {
        _.each(blocks, function (col) {
            col[col.length - 1].bottomY = padding.bottomY;
        });
    }

    function render() {
        // 清除画布
        context.clearRect(0, 0, canvasWidth, canvasHeight);

        // 绘制各列题块
        for (var j = 0; j < blocks.length; j++) {
            var col = blocks[j];
            var left = getColLeft(j);
            var isHoveringCol = mouseInfo.hoveringColBodyIndex === j;
            for (var i = 0; i < col.length; i++) {
                var isHoveringBlock = mouseInfo.hoveringBlockBodyIndex === i;
                var isHoveringLine = mouseInfo.status === MOUSE_STATUS.MOVING_Y
                    && mouseInfo.hoveringBlockLineIndex === i
                    && isHoveringCol;

                // 绘制底线（我是有底线的）
                drawHorizontalLine(col[i].bottomY, left, col.rightX, {
                    color: isHoveringLine ? 'blue' : 'red',
                });

                // 绘制删除阴影
                var a = col[i].removed ? 0.25 : 0;
                var blockTop = getBlockTop(j, i);
                drawRect(left, blockTop, col.rightX, col[i].bottomY, 'rgba(0,0,0,' + a + ')');

                // 绘制切换按钮
                if (isHoveringCol && isHoveringBlock) {
                    var hue = col[i].removed ? '100' : '0';
                    var brightness = mouseInfo.status == MOUSE_STATUS.TOGGLING_BLOCK ? '85' : '75';
                    var l = col.rightX - BUTTON_WIDTH - BUTTON_MARGIN,
                        t = blockTop + BUTTON_MARGIN,
                        r = col.rightX - BUTTON_MARGIN,
                        b = blockTop + BUTTON_HEIGHT + BUTTON_MARGIN;
                    drawRect(l, t, r, b, 'hsl(' + hue + ', 50%, ' + brightness + '%)');
                    strokeRect(l, t, r, b);
                    col[i].removed ? drawCheck(l, t, r, b) : drawCross(l, t, r, b);
                }
            }
            // 绘制该列右边线
            if (j < blocks.length - 1) drawVerticalLine(col.rightX, {
                color: mouseInfo.hoveringColLineIndex === j ? 'blue' : 'red',
            });
        }

        // 绘制竖栏切割线
        if (mouseInfo.status === MOUSE_STATUS.ADDING_COL) {
            drawVerticalLine(mouseInfo.x, {
                color: 'red',
                lineDash: DASH_STYLE,
            });
        }

        // 绘制题块切割线
        var col = blocks[mouseInfo.hoveringColBodyIndex];
        if (mouseInfo.status === MOUSE_STATUS.ADDING_BLOCK && !col.lastRemoved) {
            drawHorizontalLine(mouseInfo.y, getColLeft(mouseInfo.hoveringColBodyIndex),
                col.rightX, {color: 'red', lineDash: DASH_STYLE});
        }

        // 绘制边线
        drawVerticalLine(padding.leftX, {
            color: mouseInfo.status === MOUSE_STATUS.MOVING_PADDING_LEFT ? 'blue' : 'red',
        });
        drawVerticalLine(padding.rightX, {
            color: mouseInfo.status === MOUSE_STATUS.MOVING_PADDING_RIGHT ? 'blue' : 'red',
        });
        drawHorizontalLine(padding.topY, 0, canvasWidth, {
            color: mouseInfo.status === MOUSE_STATUS.MOVING_HEADER ? 'blue' : 'red',
        });
        drawHorizontalLine(padding.bottomY, 0, canvasWidth, {
            color: mouseInfo.status === MOUSE_STATUS.MOVING_FOOTER ? 'blue' : 'red',
        });

        // 绘制边距蒙版
        drawRect(0, 0, padding.leftX, canvasHeight);
        drawRect(padding.rightX, 0, canvasWidth, canvasHeight);
        drawRect(padding.leftX, 0, padding.rightX, padding.topY);
        drawRect(padding.leftX, padding.bottomY, padding.rightX, canvasHeight);

        // 使虚线动起来
        context.lineDashOffset -= 0.5;

        // 下一帧
        rafRender = requestAnimationFrame(render);
    }

    function setLineStyle(options) {
        options = options || {};
        options.color = options.color || 'black';
        options.lineWidth = options.lineWidth || 1.6;
        options.lineDash = options.lineDash || [];

        context.strokeStyle = options.color;
        context.lineWidth = options.lineWidth;
        context.setLineDash(options.lineDash);
    }

    function drawHorizontalLine(y, x1, x2, options) {
        setLineStyle(options);
        context.beginPath();
        context.moveTo(x1, y);
        context.lineTo(x2, y);
        context.stroke();
    }

    function drawVerticalLine(x, options) {
        setLineStyle(options);
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, canvasHeight);
        context.stroke();
    }

    function drawLine(x1, y1, x2, y2, options) {
        setLineStyle(options);
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
    }

    function drawRect(x1, y1, x2, y2, color) {
        context.fillStyle = color || 'rgba(0, 0, 0, 0.25)';

        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y1);
        context.lineTo(x2, y2);
        context.lineTo(x1, y2);
        context.lineTo(x1, y1);
        context.fill();
    }

    function drawCross(l, t, r, b) {
        var hs = (b - t) / 4,  // half size
            xM = (l + r) / 2,
            yM = (t + b) / 2;
        var xLT = xM - hs, yLT = yM - hs;
        var xRT = xM + hs, yRT = yM - hs;
        var xLB = xM - hs, yLB = yM + hs;
        var xRB = xM + hs, yRB = yM + hs;

        drawLine(xLT, yLT, xRB, yRB);
        drawLine(xLB, yLB, xRT, yRT);
    }

    function drawCheck(l, t, r, b) {
        var hs = (b - t) / 4,  // half size
            xM = (l + r) / 2,
            yM = (t + b) / 2;
        var xL = xM - hs - hs / 8, yL = yM - hs / 4 - hs / 8;
        var xB = xM - hs / 4, yB = yM + hs - hs / 8;
        var xRT = xM + hs + hs / 8, yRT = yM - hs + hs / 8;

        drawLine(xL, yL, xB, yB);
        drawLine(xB, yB, xRT, yRT);
    }

    function strokeRect(x1, y1, x2, y2, color) {
        context.strokeStyle = color || 'rgba(0, 0, 0, 1)';
        context.lineWidth = 1;

        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y1);
        context.lineTo(x2, y2);
        context.lineTo(x1, y2);
        context.lineTo(x1, y1);
        context.stroke();
    }

    function getCuttedImageRects() {
        var imageRects = [];
        for (var j = 0; j < blocks.length; j++) {
            var col = blocks[j];
            var px1 = getColLeft(j) / canvasWidth,
                px2 = col.rightX / canvasWidth;
            for (var i = 0, len = col.length; i < len; i++) {
                if (col[i].removed) continue;
                var py1 = getBlockTop(j, i) / canvasHeight,
                    py2 = col[i].bottomY / canvasHeight;
                var w = px2 - px1,
                    h = py2 - py1;
                var ratio = (canvasWidth * w) / (canvasHeight * h);
                imageRects.push({x: px1, y: py1, w: w, h: h, ratio: ratio});
            }
        }
        return imageRects;
    }

    function cropImage(image, rect) {
        // 为了提高切图性能，缩放图像，限制其短边最长为 1280
        var scale = 1280 / Math.min(image.naturalWidth, image.naturalHeight);
        if (scale > 1) scale = 1;
        var width = image.naturalWidth * scale,
            height = image.naturalHeight * scale;
        var x = width * rect.x,
            y = height * rect.y,
            w = width * rect.w,
            h = height * rect.h;
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(image, -x, -y, width, height);
        return canvas.toDataURL('image/png');
    }

    this.cutToDataUrls = function () {
        var imageRects = getCuttedImageRects();
        var imageSrcs = [];
        for (var i = 0; i < imageRects.length; i++) {
            imageSrcs.push(cropImage(imageDom, imageRects[i]));
        }
        return imageSrcs;
    };

    this.cutToRects = function () {
        return getCuttedImageRects();
    };

    var BLOB_MAX_SIDE_LENGTH = 800;

    this.cutToBlobs = function (onBlobCutted) {
        if (typeof onBlobCutted !== 'function') return;
        var imageRects = getCuttedImageRects();
        var imageBlobs = [];
        var countCompleted = 0;
        for (var i = 0; i < imageRects.length; i++) {
            // 转换坐标
            var left = imageDom.naturalWidth * imageRects[i].x,
                top = imageDom.naturalHeight * imageRects[i].y,
                width = imageDom.naturalWidth * imageRects[i].w,
                height = imageDom.naturalHeight * imageRects[i].h;

            // 压缩大小
            var shrinkScale = 1;
            if (Math.max(width, height) > BLOB_MAX_SIDE_LENGTH) {
                shrinkScale = BLOB_MAX_SIDE_LENGTH / Math.max(width, height);
                width *= shrinkScale;
                height *= shrinkScale;
                left *= shrinkScale;
                top *= shrinkScale;
            }

            // 转为canvas
            var canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(imageDom, -left, -top,
                imageDom.naturalWidth * shrinkScale,
                imageDom.naturalHeight * shrinkScale);

            // 拿到blob
            (function (i) {
                canvas.toBlob(function (blob) {
                    imageBlobs[i] = blob;
                    countCompleted += 1;
                    if (countCompleted === imageRects.length) onBlobCutted(imageBlobs);
                });
            })(i);
        }
    };

    this.destroy = destroy;

    // end of class
}
