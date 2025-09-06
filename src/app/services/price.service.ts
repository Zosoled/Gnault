import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { BehaviorSubject, firstValueFrom } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class PriceService {
	private http: HttpClient = inject(HttpClient)

	static storeKey: 'Gnault-Price' = 'Gnault-Price'
	static apiUrl: string = `https://api.coingecko.com/api/v3/coins/nano?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`

	#lastPrice$: BehaviorSubject<number> = new BehaviorSubject(1)
	get lastPrice$ (): BehaviorSubject<number> { return this.#lastPrice$ }

	lastPrice: number = 0
	lastPriceBtc: number = 0

	constructor () {
		this.loadPrice()
	}

	async fetchPrice (currency?: string): Promise<number> {
		currency ??= 'usd'
		const request = this.http.get(`${PriceService.apiUrl}`)
		const response: any = await firstValueFrom(request)
		if (!response) {
			return this.lastPrice
		}

		const quote = response.market_data.current_price
		this.lastPrice = quote[currency.toLowerCase()]
		this.lastPriceBtc = quote.btc

		this.savePrice()
		this.lastPrice$.next(this.lastPrice)
		return this.lastPrice
	}

	loadPrice (): void {
		const priceData = localStorage.getItem(PriceService.storeKey)
		if (priceData) {
			Object.assign(this, JSON.parse(priceData))
		}
	}

	savePrice (): void {
		localStorage.setItem(PriceService.storeKey, JSON.stringify(this))
	}
}
