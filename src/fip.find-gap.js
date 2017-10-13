// 寻找竖栏间隔（目前只支持双栏）
Fip.prototype.findGap = function (from) {

    var GAP_LINT_COUNT_THRESHOLD = 6;
    var GAP_MIN_WIDTH = 0.02;

    var findGapLeft = (from) => {
        from = from || 0.33;
        for (var j = Math.round(from * this.width), to = Math.round(this.width * 0.66); j < to; j += 1) {
            if (this.calcColBlackLineCount(j) < GAP_LINT_COUNT_THRESHOLD) {
                return j / this.width;
            }
        }
        return 0;
    }

    var findGapRight = (from) => {
        for (var j = Math.round(from * this.width), to = Math.round(this.width * 0.75); j < to; j += 1) {
            if (this.calcColBlackLineCount(j) > GAP_LINT_COUNT_THRESHOLD) {
                return j / this.width;
            }
        }
        return 0;
    }

    from = from || 0.33;
    var gapLeft = findGapLeft(from);
    if (gapLeft > 0) {
        var gapRight = findGapRight(gapLeft);
        if (gapRight <= gapLeft) {
            return null;
        } else if (gapRight - gapLeft < GAP_MIN_WIDTH) {
            return this.findGap(gapRight);
        }
        return {
            left: gapLeft,
            right: gapRight,
            middle: (gapLeft + gapRight) / 2,
        }
    } else {
        return null;
    }
}
