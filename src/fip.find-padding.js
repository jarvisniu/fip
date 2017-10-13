// 边距检测
Fip.prototype.findPadding = function () {

    var DEFAULT_PADDING = 0.05;         // 如果在三分之一的范围内都搜不到文字（比如白纸），返回该值
    var PADDING_OFFSET = 5 / 1000;      // 别把边距切完，留一点
    var BLACK_LINE_COUNT_THRESHOLD = 6; // 用黑线数量检测边距的阈值

    var findPaddingLeft = () => {
        for (var j = 0; j < this.width / 3; j += 1) {
            if (this.calcColBlackLineCount(j) > BLACK_LINE_COUNT_THRESHOLD) {
                var pos = j / this.width - PADDING_OFFSET;
                if (pos <= 0) pos += PADDING_OFFSET;
                return pos;
            }
        }
        return DEFAULT_PADDING;
    }

    var findPaddingRight = () => {
        for (var j = this.width - 1; j > this.width * 2 / 3; j -= 1) {
            if (this.calcColBlackLineCount(j) > BLACK_LINE_COUNT_THRESHOLD) {
                var pos = j / this.width + PADDING_OFFSET;
                if (pos >= 1) pos -= PADDING_OFFSET;
                return pos;
            }
        }
        return 1 - DEFAULT_PADDING;
    }

    var findPaddingTop = () => {
        for (var j = 0; j < this.height / 3; j += 1) {
            if (this.calcRowBlackLineCount(j) > BLACK_LINE_COUNT_THRESHOLD) {
                var pos = j / this.height - PADDING_OFFSET;
                if (pos <= 0) pos += PADDING_OFFSET;
                return pos;
            }
        }
        return DEFAULT_PADDING;
    }

    var findPaddingBottom = () => {
        for (var j = this.height - 1; j > this.height * 2 / 3; j -= 1) {
            if (this.calcRowBlackLineCount(j) > BLACK_LINE_COUNT_THRESHOLD) {
                var pos = j / this.height + PADDING_OFFSET;
                if (pos >= 1) pos -= PADDING_OFFSET;
                return pos;
            }
        }
        return 1 - DEFAULT_PADDING;
    }
    return {
        left: findPaddingLeft(),
        right: findPaddingRight(),
        top: findPaddingTop(),
        bottom: findPaddingBottom(),
    };
};
