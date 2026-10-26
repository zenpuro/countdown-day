/**
 * 仅测试用的 lunar-javascript 类型声明（交叉验证数据源，不进入产物）。
 * 只声明测试实际用到的 API。
 */
declare module 'lunar-javascript' {
	export class Solar {
		static fromYmd(y: number, m: number, d: number): Solar;
		getYear(): number;
		getMonth(): number;
		getDay(): number;
		toYmd(): string;
		getLunar(): Lunar;
	}

	export class Lunar {
		static fromYmd(y: number, m: number, d: number): Lunar;
		getYear(): number;
		/** 闰月返回负数月号。 */
		getMonth(): number;
		getDay(): number;
		getSolar(): Solar;
	}

	export class LunarMonth {
		/** month 为负表示闰月。 */
		static fromYm(y: number, month: number): LunarMonth;
		getDayCount(): number;
	}

	export class LunarYear {
		static fromYear(y: number): LunarYear;
		getLeapMonth(): number;
	}
}
