import {wrapText} from './printing/layout';

const INIT = '\x1b\x40';
const ALIGN_CENTER = '\x1b\x61\x01';
const ALIGN_LEFT = '\x1b\x61\x00';
const ALIGN_RIGHT = '\x1b\x61\x02';
const PRINT_FEED_LINE = '\x0A';
const PRINT_FEED_LINES = '\x1b\x64';
const SMALL_TEXT = '\x1b\x21\x01';
const RESET_TEXT = '\x1b\x21\x00';
const EMPHASIZED_ON = '\x1b\x21\x08';
const UNDERLINE_ON = '\x1b\x21\x128';
const DOUBLE_HEIGHT = '\x1b\x21\x16';
const DOUBLE_WIDTH = '\x1b\x21\x32';
const TAB = '\x09';

export default class EscposBuilder {

  constructor(profile = null) {
   this.buffer = '';
   this.profile = profile;
  }

  init() {
    this.buffer += INIT;
    if (this.profile) {
      const width = this.profile.printWidthDots;
      // Zero character spacing/left margin; explicit printable area in dots.
      this.buffer += '\x1b\x20\x00\x1d\x4c\x00\x00\x1d\x57' +
        String.fromCharCode(width & 255, (width >> 8) & 255);
    }
    return this;
  }

  test() {
    this.buffer += '\x1b\x5c\x11\x05';
    return this;
  }

  tab() {
    this.buffer += TAB;
    return this;
  }

  align(align) {
    if (align === 'center') {
      this.buffer += ALIGN_CENTER;
    }

    if (align === 'left') {
      this.buffer += ALIGN_LEFT;
    }

    if (align === 'right') {
      this.buffer += ALIGN_RIGHT;
    }

    return this;
  }

  text(text, size = 'normal', bold = false) {
    if (this.profile) {
      const small = size === 'small';
      // Set font and emphasis together: a separate ESC ! 8 would reset Font B.
      this.buffer += '\x1b\x21' + String.fromCharCode((small ? 1 : 0) | (bold ? 8 : 0));
      const columns = small ? this.profile.smallColumns : this.profile.columns;
      const value = /^[-=]{20,}$/.test(String(text)) ? String(text)[0].repeat(columns) : text;
      // Wide glyphs use the printer's 24-dot character cell even in Font B.
      const pitch = small ? this.profile.fontBDots : this.profile.fontADots;
      this.buffer += wrapText(value, columns, Math.ceil(24 / pitch));
      this.buffer += RESET_TEXT;
      return this;
    }
    if (size === 'small') {
      this.buffer += SMALL_TEXT;
    }

    if (bold) {
      this.buffer += EMPHASIZED_ON;
    }

    this.buffer += text;

    this.buffer += RESET_TEXT;

    return this;
  }

  printLineFeed(n = 1) {
    for (let c = 0; c < n; c++) {
      this.buffer += PRINT_FEED_LINE;
    }
    return this;
  }

  build() {
    const buildBuffer = this.buffer;
    this.buffer = '';
    return buildBuffer;
  }

  pad(str, max) {
    str = str.toString();
    return str.length < max ? pad("0" + str, max) : str;
  }


}
