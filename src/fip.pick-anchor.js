// 拾取定位点（黑色矩形）
Fip.prototype.pickAnchor = function (nx, ny) {

    // 分析一个点周围区域是否是黑方块，需要黑色占比超过90%。
    var isBlackSqureAt = (x, y, range) => {
        var analysisResult = this.analysisPixels(this.getSurroundingPixels(x, y, range));
        return analysisResult.isBlackMore && analysisResult.proportionOfMore > 0.9;
    }

    // 寻找离某点最近的黑方块
    // range: 黑方块的半径，默认2像素（即边长为5）
    // limit: 最远距离（相对于长宽的百分比）
    var findNearestBlackSquare = (x, y, range, limit) => {
        range = range || 2;
        limit = limit || 0.04;

        var limitPx = this.shortSide * limit;
        var squreSideLen = range * 2 + 1;
        var layerDist = squreSideLen * 2;
        var layerNum = Math.round(limitPx / layerDist);
        // 由内向外收集测试点坐标
        var points = [[0, x, y]];
        for(var z = 1; z <= layerNum; z ++) {
            // 水平方向（含角点）
            for (var i = -z; i <= z;i++) {
                points.push([z, x + i * squreSideLen, y + z * squreSideLen]);
                points.push([z, x + i * squreSideLen, y - z * squreSideLen]);
                if (this.debugging) {
                    this.context.fillStyle = 'red';
                    this.context.fillRect(x + i * squreSideLen, y + z * squreSideLen, 1, 1);
                    this.context.fillRect(x + i * squreSideLen, y - z * squreSideLen, 1, 1);
                }
            }
            // 垂直方向（不含角点）
            for (var j = -z + 1; j < z; j++) {
                points.push([z, x + z * squreSideLen, y + j * squreSideLen]);
                points.push([z, x - z * squreSideLen, y + j * squreSideLen]);
                if (this.debugging) {
                    this.context.fillStyle = 'red';
                    this.context.fillRect(x + z * squreSideLen, y + j * squreSideLen, 1, 1);
                    this.context.fillRect(x - z * squreSideLen, y + j * squreSideLen, 1, 1);
                }
            }
        }
        for (var i = 0, len = points.length; i < len; i++) {
            var x = points[i][1],
                y = points[i][2];
            if (isBlackSqureAt(x, y, 2)) {
                if (this.debugging) {
                    this.context.fillStyle = 'blue';
                    this.context.fillRect(x - 1, y - 1, 3, 3);
                }
                return [x, y];
                break;
            }
        }
        // console.log('limitPx, layerDist, layerNum, points', limitPx, layerDist, layerNum, points);
        return null;
    }

    // 归一坐标转为像素坐标
    var x = Math.round(nx * this.width),
        y = Math.round(ny * this.height);

    // 找到最近的定位点
    var nearestSquarePoint = findNearestBlackSquare(x, y);
    if (!nearestSquarePoint) throw '未找到定位点';

    // 设置拾取位置为找到的位置
    x = nearestSquarePoint[0];
    y = nearestSquarePoint[1];
    
    // 向外扩张
    var expand = {
        top: {dist: 2, stopped: false},
        bottom: {dist: 2, stopped: false},
        left: {dist: 2, stopped: false},
        right: {dist: 2, stopped: false},
    };

    var tryExpand = (dx, dy) => {
        var direction =  dx == 0 ? (dy > 0 ? 'bottom' : 'top') : (dx > 0 ? 'right' : 'left');
        if (expand[direction].stopped) return;
        if (dx < 0 && x - expand['left'].dist - 1 < 0) {
            expand['left'].stopped = true;
        } else if (dx > 0 && x + expand['right'].dist + 1 >= this.width) {
            expand['right'].stopped = true;
        } else if (dy < 0 && y - expand['bottom'].dist - 1 < 0) {
            expand['bottom'].stopped = true;
        } else if (dy > 0 && y + expand['top'].dist + 1 >= this.height) {
            expand['top'].stopped = true;
        } else {
            var blackCount = 0, blackSum;
            if (dx == 0) {
                blackSum = expand.left.dist + expand.bottom.dist + 1;
                for (var i = x - expand.left.dist; i <= x + expand.right.dist; i ++) {
                    if (this.isPixelBinBlack(i, y + (expand[direction].dist + 1) * dy)) blackCount += 1;
                }
            } else {
                blackSum = expand.top.dist + expand.bottom.dist + 1;
                for (var i = y - expand.top.dist; i <= y + expand.bottom.dist; i ++) {
                    if (this.isPixelBinBlack(x + (expand[direction].dist + 1) * dx, i)) blackCount += 1;
                }
            }
            if (blackCount < blackSum * 0.3) {
                expand[direction].stopped = true;
            } else {
                expand[direction].dist += 1;
                // console.log('expand ' + direction + ' success');
            }
        }
    }

    while (!expand.top.stopped || !expand.bottom.stopped || !expand.left.stopped || !expand.right.stopped) {
        tryExpand(0, -1);
        tryExpand(1, 0);
        tryExpand(0, 1);
        tryExpand(-1, 0);
    }

    // console.log('expand left, right, top, bottom dist: ',
    //     expand.left.dist, expand.right.dist, expand.top.dist, expand.bottom.dist);

    return {
        left: (x - expand.left.dist - 0.5) / this.width,
        top: (y - expand.top.dist - 0.5) / this.height,
        right: (x + expand.right.dist + 0.5) / this.width,
        bottom: (y + expand.bottom.dist + 0.5) / this.height,
    };
};
