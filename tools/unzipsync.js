// ↓↓↓↓↓↓ This section of code is from the fflate library. ↓↓↓↓↓↓
const u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
const err = (m) => { throw new Error(m); };
const b2 = (d, b) => d[b] | (d[b + 1] << 8);
const b4 = (d, b) => (d[b] | (d[b + 1] << 8) | (d[b + 2] << 16) | (d[b + 3] << 24)) >>> 0;
const slc = (v, s, e) => {
    if (s == null || s < 0)
        s = 0;
    if (e == null || e > v.length)
        e = v.length;
    return new u8(v.subarray(s, e));
};
const zh = (d, b) => {
    const fnl = b2(d, b + 28);
    const fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048));
    const es = b + 46 + fnl;
    const sc = b4(d, b + 20);
    const su = b4(d, b + 24);
    const off = b4(d, b + 42);
    return [b2(d, b + 10), sc, su, fn, es + b2(d, b + 30) + b2(d, b + 32), off];
};
const slzh = (d, b) => b + 30 + b2(d, b + 26) + b2(d, b + 28);
const strFromU8 = (dat, latin1) => {
    if (latin1) {
        let r = '';
        for (let i = 0; i < dat.length; i++) {
            r += String.fromCharCode(dat[i]);
        }
        return r;
    }
    const td = typeof TextDecoder != 'undefined' && new TextDecoder();
    if (td)
        return td.decode(dat);
    let r = '';
    for (let i = 0; i < dat.length;) {
        let c = dat[i++];
        if (c < 128)
            r += String.fromCharCode(c);
        else if (c < 224)
            r += String.fromCharCode((c & 31) << 6 | (dat[i++] & 63));
        else if (c < 240)
            r += String.fromCharCode((c & 15) << 12 | (dat[i++] & 63) << 6 | (dat[i++] & 63));
        else {
            c = ((c & 7) << 18 | (dat[i++] & 63) << 12 | (dat[i++] & 63) << 6 | (dat[i++] & 63)) - 0x10000;
            r += String.fromCharCode(0xD800 | (c >> 10), 0xDC00 | (c & 0x3FF));
        }
    }
    return r;
};
const inflateSync = (data, opts) => {
    return inflt(data, { i: 2 }, opts && opts.out);
};
const inflt = (dat, st, buf) => {
    const sl = dat.length;
    if (!sl || st.f && !st.l)
        return buf || new u8(0);
    const noBuf = !buf;
    if (noBuf)
        buf = new u8(sl * 3);
    const cbuf = (l) => {
        let bl = buf.length;
        if (l > bl) {
            const nbuf = new u8(Math.max(bl * 2, l));
            nbuf.set(buf);
            buf = nbuf;
        }
    };
    let final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
    const tbts = sl * 8;
    do {
        if (!lm) {
            final = bits(dat, pos, 1);
            const type = bits(dat, pos + 1, 3);
            pos += 3;
            if (!type) {
                const s = shft(pos) + 4, l = dat[s - 4] | (dat[s - 3] << 8), t = s + l;
                if (t > sl) {
                    if (!st.i)
                        err("unexpected EOF");
                    break;
                }
                if (noBuf)
                    cbuf(bt + l);
                buf.set(dat.subarray(s, t), bt);
                st.b = bt += l, st.p = pos = t * 8, st.f = final;
                continue;
            }
            else if (type == 1)
                lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
            else if (type == 2) {
                const hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
                const tl = hLit + bits(dat, pos + 5, 31) + 1;
                pos += 14;
                const ldt = new u8(tl);
                const clt = new u8(19);
                for (let i = 0; i < hcLen; ++i) {
                    clt[clim[i]] = bits(dat, pos + i * 3, 7);
                }
                pos += hcLen * 3;
                const clb = max(clt), clbmsk = (1 << clb) - 1;
                if (!clb)
                    err("invalid code lengths");
                const clm = hMap(clt, clb, 1);
                for (let i = 0; i < tl;) {
                    const r = clm[bits(dat, pos, clbmsk)];
                    pos += r & 15;
                    const s = r >> 4;
                    if (s < 16) {
                        ldt[i++] = s;
                    }
                    else {
                        let c = 0, n = 0;
                        if (s == 16)
                            n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
                        else if (s == 17)
                            n = 3 + bits(dat, pos, 7), pos += 3;
                        else if (s == 18)
                            n = 11 + bits(dat, pos, 127), pos += 7;
                        while (n--)
                            ldt[i++] = c;
                    }
                }
                const lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
                lbt = max(lt);
                dbt = max(dt);
                lm = hMap(lt, lbt, 1);
                dm = hMap(dt, dbt, 1);
            }
            else
                err("invalid block type");
            if (pos > tbts) {
                if (!st.i)
                    err("unexpected EOF");
                break;
            }
        }
        if (noBuf)
            cbuf(bt + 131072);
        const lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
        let lpos = pos;
        for (;; lpos = pos) {
            const c = lm[bits16(dat, pos) & lms], sym = c >> 4;
            pos += c & 15;
            if (pos > tbts) {
                if (!st.i)
                    err("unexpected EOF");
                break;
            }
            if (!c)
                err("invalid length/literal");
            if (sym < 256)
                buf[bt++] = sym;
            else if (sym == 256) {
                lpos = pos, lm = null;
                break;
            }
            else {
                let add = sym - 254;
                if (sym > 264) {
                    const i = sym - 257, b = fleb[i];
                    add = bits(dat, pos, (1 << b) - 1) + fl[i];
                    pos += b;
                }
                const d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
                if (!d)
                    err("invalid distance");
                pos += d & 15;
                let dt = fd[dsym];
                if (dsym > 3) {
                    const b = fdeb[dsym];
                    dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
                }
                if (pos > tbts) {
                    if (!st.i)
                        err("unexpected EOF");
                    break;
                }
                if (noBuf)
                    cbuf(bt + 131072);
                const end = bt + add;
                for (; bt < end; ++bt)
                    buf[bt] = buf[bt - dt];
            }
        }
        st.l = lm, st.p = lpos, st.b = bt, st.f = final;
        if (lm)
            final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    } while (!final);
    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
const fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 0, 0, 0]);
const fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 0, 0]);
const clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
const freb = (eb, start) => {
    const b = new u16(31);
    for (let i = 0; i < 31; ++i) {
        b[i] = start += 1 << eb[i - 1];
    }
    const r = new i32(b[30]);
    for (let i = 1; i < 30; ++i) {
        for (let j = b[i]; j < b[i + 1]; ++j) {
            r[j] = ((j - b[i]) << 5) | i;
        }
    }
    return { b, r };
};
const { b: fl, r: revfl } = freb(fleb, 2);
fl[28] = 258, revfl[258] = 28;
const { b: fd, r: revfd } = freb(fdeb, 0);
const rev = new u16(32768);
for (let i = 0; i < 32768; ++i) {
    let x = ((i & 0xAAAA) >> 1) | ((i & 0x5555) << 1);
    x = ((x & 0xCCCC) >> 2) | ((x & 0x3333) << 2);
    x = ((x & 0xF0F0) >> 4) | ((x & 0x0F0F) << 4);
    rev[i] = (((x & 0xFF00) >> 8) | ((x & 0x00FF) << 8)) >> 1;
}
;
const hMap = ((cd, mb, r) => {
    const s = cd.length;
    let i = 0;
    const l = new u16(mb);
    for (; i < s; ++i) {
        if (cd[i])
            ++l[cd[i] - 1];
    }
    const le = new u16(mb);
    for (i = 1; i < mb; ++i) {
        le[i] = (le[i - 1] + l[i - 1]) << 1;
    }
    let co;
    if (r) {
        co = new u16(1 << mb);
        const rvb = 15 - mb;
        for (i = 0; i < s; ++i) {
            if (cd[i]) {
                const sv = (i << 4) | cd[i];
                const r = mb - cd[i];
                let v = le[cd[i] - 1]++ << r;
                for (const m = v | ((1 << r) - 1); v <= m; ++v) {
                    co[rev[v] >> rvb] = sv;
                }
            }
        }
    }
    else {
        co = new u16(s);
        for (i = 0; i < s; ++i) {
            if (cd[i]) {
                co[i] = rev[le[cd[i] - 1]++] >> (15 - cd[i]);
            }
        }
    }
    return co;
});
const flt = new u8(288);
for (let i = 0; i < 144; ++i)
    flt[i] = 8;
for (let i = 144; i < 256; ++i)
    flt[i] = 9;
for (let i = 256; i < 280; ++i)
    flt[i] = 7;
for (let i = 280; i < 288; ++i)
    flt[i] = 8;
const fdt = new u8(32);
for (let i = 0; i < 32; ++i)
    fdt[i] = 5;
const flrm = hMap(flt, 9, 1);
const fdrm = hMap(fdt, 5, 1);
const max = (a) => {
    let m = a[0];
    for (let i = 1; i < a.length; ++i) {
        if (a[i] > m)
            m = a[i];
    }
    return m;
};
const bits = (d, p, m) => {
    const o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8)) >> (p & 7)) & m;
};
const bits16 = (d, p) => {
    const o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) >> (p & 7));
};
const shft = (p) => ((p + 7) / 8) | 0;
export function unzipSync(data) {
    const files = {};
    let e = data.length - 22;
    for (; b4(data, e) != 0x6054B50; --e) {
        if (!e || data.length - e > 65558)
            err("invalid zip data");
    }
    ;
    let c = b2(data, e + 8);
    if (!c)
        return {};
    let o = b4(data, e + 16);
    for (let i = 0; i < c; ++i) {
        const [compression, compressedSize, uncompressedSize, fileName, nextOffset, headerOffset] = zh(data, o);
        const dataOffset = slzh(data, headerOffset);
        o = nextOffset;
        if (!compression) {
            files[fileName] = slc(data, dataOffset, dataOffset + compressedSize);
        }
        else if (compression == 8) {
            files[fileName] = inflateSync(data.subarray(dataOffset, dataOffset + compressedSize), { out: new u8(uncompressedSize) });
        }
        else {
            err("unknown compression type: " + compression);
        }
    }
    return files;
}