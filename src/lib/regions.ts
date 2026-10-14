// Country and state lists for the prize shipping form. Shared by the page and its server action.
export type Option = { value: string; label: string; icon?: string };

const COUNTRY_CODES = `AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ
BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH
ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL
IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC
MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA
PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST
SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK
YE YT ZA ZM ZW`.split(/\s+/);

function flag(code: string) {
	return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export const COUNTRIES: Option[] = COUNTRY_CODES.map((code) => ({
	value: code,
	label: regionNames.of(code) ?? code,
	icon: flag(code)
})).sort((a, b) => a.label.localeCompare(b.label));

export const DEFAULT_COUNTRY = 'US';

/** @param entries `CODE:Name` pairs separated by `|`; a bare name is its own code. */
function parse(entries: string): Option[] {
	return entries.split('|').map((entry) => {
		const [code, name] = entry.includes(':') ? entry.split(':') : [entry, entry];
		return { value: code, label: name };
	});
}

export const STATES: Record<string, Option[]> = {
	US: parse(
		'AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming|AS:American Samoa|GU:Guam|MP:Northern Mariana Islands|PR:Puerto Rico|VI:U.S. Virgin Islands|AA:Armed Forces Americas|AE:Armed Forces Europe|AP:Armed Forces Pacific'
	),
	CA: parse(
		'AB:Alberta|BC:British Columbia|MB:Manitoba|NB:New Brunswick|NL:Newfoundland and Labrador|NS:Nova Scotia|NT:Northwest Territories|NU:Nunavut|ON:Ontario|PE:Prince Edward Island|QC:Quebec|SK:Saskatchewan|YT:Yukon'
	),
	AU: parse(
		'ACT:Australian Capital Territory|NSW:New South Wales|NT:Northern Territory|QLD:Queensland|SA:South Australia|TAS:Tasmania|VIC:Victoria|WA:Western Australia'
	),
	IN: parse(
		'Andaman and Nicobar Islands|Andhra Pradesh|Arunachal Pradesh|Assam|Bihar|Chandigarh|Chhattisgarh|Dadra and Nagar Haveli and Daman and Diu|Delhi|Goa|Gujarat|Haryana|Himachal Pradesh|Jammu and Kashmir|Jharkhand|Karnataka|Kerala|Ladakh|Lakshadweep|Madhya Pradesh|Maharashtra|Manipur|Meghalaya|Mizoram|Nagaland|Odisha|Puducherry|Punjab|Rajasthan|Sikkim|Tamil Nadu|Telangana|Tripura|Uttar Pradesh|Uttarakhand|West Bengal'
	)
};

// Countries with no postal code system, where the ZIP field is optional.
export const NO_POSTAL_CODE = new Set(
	`AE AG AO AW BF BI BJ BO BS BW BZ CD CF CG CI CK CM DJ DM ER FJ GA GD GH GM GQ GY HK JM KI KM KN KP LC
ML MO MR MW NR NU QA RW SB SC SL SR ST SY TD TG TK TL TO TT TV UG VU YE ZW`.split(/\s+/)
);

// Formats for the countries most participants ship to; anything else gets a loose sanity check.
const POSTAL_CODE: Record<string, RegExp> = {
	US: /^\d{5}(-\d{4})?$/,
	CA: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i,
	GB: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
	IE: /^[A-Z]\d[\dW] ?[A-Z\d]{4}$/i,
	AU: /^\d{4}$/,
	NZ: /^\d{4}$/,
	IN: /^\d{3} ?\d{3}$/,
	DE: /^\d{5}$/,
	FR: /^\d{5}$/,
	IT: /^\d{5}$/,
	ES: /^\d{5}$/,
	NL: /^\d{4} ?[A-Z]{2}$/i,
	BE: /^\d{4}$/,
	CH: /^\d{4}$/,
	AT: /^\d{4}$/,
	DK: /^\d{4}$/,
	NO: /^\d{4}$/,
	SE: /^\d{3} ?\d{2}$/,
	FI: /^\d{5}$/,
	PL: /^\d{2}-?\d{3}$/,
	PT: /^\d{4}-?\d{3}$/,
	RO: /^\d{6}$/,
	UA: /^\d{5}$/,
	TR: /^\d{5}$/,
	IL: /^\d{5}(\d{2})?$/,
	BR: /^\d{5}-?\d{3}$/,
	MX: /^\d{5}$/,
	JP: /^\d{3}-?\d{4}$/,
	KR: /^\d{5}$/,
	CN: /^\d{6}$/,
	TW: /^\d{3}(\d{2,3})?$/,
	SG: /^\d{6}$/,
	MY: /^\d{5}$/,
	ID: /^\d{5}$/,
	PH: /^\d{4}$/,
	TH: /^\d{5}$/,
	VN: /^\d{6}$/,
	PK: /^\d{5}$/,
	BD: /^\d{4}$/,
	NG: /^\d{6}$/,
	KE: /^\d{5}$/,
	EG: /^\d{5}$/,
	ZA: /^\d{4}$/
};

// Countries where every street address carries a number.
const NUMBERED_STREETS = new Set(['US', 'CA', 'AU']);

const HAS_LETTER = /\p{L}/u;

export type ShippingValues = {
	firstName: string;
	lastName: string;
	email: string;
	addressLine1: string;
	city: string;
	state: string;
	zip: string;
	country: string;
	birthday: string;
};

function isPastDate(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return (
		!Number.isNaN(date.valueOf()) &&
		date.toISOString().slice(0, 10) === value &&
		date.getUTCFullYear() >= 1900 &&
		date < new Date()
	);
}

/** Runs in the browser before submit and again on the server, so both reject the same input. */
export function validateShipping(v: ShippingValues) {
	const errors: Record<string, string> = {};
	const states = STATES[v.country];
	const postal = POSTAL_CODE[v.country];
	const zip = v.zip.trim();

	if (!HAS_LETTER.test(v.firstName)) errors.firstName = 'Enter your first name.';
	if (!HAS_LETTER.test(v.lastName)) errors.lastName = 'Enter your last name.';
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) errors.email = 'Enter a valid email.';

	const line1 = v.addressLine1.trim();
	if (line1.length < 4 || !HAS_LETTER.test(line1)) {
		errors.addressLine1 = 'Enter your full street address.';
	} else if (NUMBERED_STREETS.has(v.country) && !/\d/.test(line1)) {
		errors.addressLine1 = 'Include your house or building number.';
	}
	if (v.city.trim().length < 2 || !HAS_LETTER.test(v.city)) errors.city = 'Enter your city.';
	if (!COUNTRIES.some((c) => c.value === v.country)) errors.country = 'Pick your country.';
	if (states && !states.some((s) => s.value === v.state)) {
		errors.state = 'Pick your state or province.';
	}

	if (!zip) {
		if (!NO_POSTAL_CODE.has(v.country)) errors.zip = 'Enter your ZIP / postal code.';
	} else if (postal ? !postal.test(zip) : !/^[A-Z\d][A-Z\d -]{1,9}$/i.test(zip)) {
		errors.zip = "That doesn't look like a valid postal code for this country.";
	}

	if (!isPastDate(v.birthday)) errors.birthday = 'Enter a valid date of birth.';
	return errors;
}
