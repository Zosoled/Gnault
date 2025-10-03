import { HttpClient, HttpHeaders } from '@angular/common/http'
import { Injectable, Signal, computed, inject } from '@angular/core'
import { AppSettingsService, NodeService, TxType } from 'app/services'
import { Rpc } from 'libnemo'
import { firstValueFrom } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class ApiService {
	private http = inject(HttpClient)
	private svcAppSettings = inject(AppSettingsService)
	private svcNode = inject(NodeService)

	rpc: Signal<Rpc> = computed(() => {
		return new Rpc(this.svcAppSettings.settings().serverAPI)
	})
	storeKey: 'Gnault-ActiveDifficulty' = 'Gnault-ActiveDifficulty'

	get settings () {
		return this.svcAppSettings.settings()
	}

	private async request (action, data, skipError, url = '', validateResponse?, attempts = 0): Promise<any> {
		if (attempts > 9) {
			throw new Error('No response from repeated requests to server')
		}
		data.action = action
		const apiUrl = url || this.settings.serverAPI
		if (!apiUrl) {
			this.svcNode.setOffline(null) // offline mode
			return
		}

		if (this.svcNode.node.status === false) {
			if (!skipError) {
				this.svcNode.setLoading()
			}
		}
		const options: Parameters<HttpClient['post']>[2] = {
			responseType: 'json',
		}
		if (this.settings.serverAuth != null && this.settings.serverAuth !== '') {
			options.headers = new HttpHeaders().set('Authorization', this.settings.serverAuth)
		}

		try {
			const res = await firstValueFrom(this.http.post(apiUrl, data, options))
			if (typeof validateResponse === 'function') {
				const { err } = validateResponse(res)
				const isValidResponse = err == null
				if (isValidResponse === false) {
					throw {
						isValidationFailure: true,
						status: 500,
						reason: err,
						res,
					}
				}
			}
			this.svcNode.setOnline()
			return res
		} catch (err) {
			if (skipError) {
				return
			}
			if (err.isValidationFailure === true) {
				console.warn('Node response failed validation.', err.reason, err.res)
			} else {
				console.error('Node responded with error', err)
			}
			if (this.settings.server === 'random') {
				// choose a new backend and do the request again
				this.svcAppSettings.loadServerSettings()
				await this.sleep(1000) // delay if all servers are down
				return this.request(action, data, skipError, '', validateResponse, attempts + 1)
			} else {
				// hard exit
				if (err.status === 429) {
					this.svcNode.setOffline('Too Many Requests to the node. Try again later or choose a different node.')
				} else {
					this.svcNode.setOffline()
				}
				throw err
			}
		}
	}

	async accountsBalances (accounts: string[]): Promise<{ balances: any }> {
		return await this.request('accounts_balances', { accounts }, false)
	}

	async accountsFrontiers (accounts: string[]): Promise<{ frontiers: { [address: string]: string } }> {
		return await this.request('accounts_frontiers', { accounts }, false)
	}

	async accountsReceivable (accounts: string[], count: number = 50): Promise<{ blocks: { [address: string]: { [hash: string]: { amount: string, source: string } } } }> {
		const data = { accounts, count, source: true, include_only_confirmed: true }
		let response
		try {
			response = await this.request('accounts_pending', data, false)
		} catch {
			response = await this.request('accounts_receivable', data, false)
		}
		return response
	}

	async accountsReceivableLimit (accounts: string[], threshold: string, count: number = 50): Promise<{ blocks: { [address: string]: { [hash: string]: { amount: string, source: string } } } }> {
		const data = { accounts, count, threshold, source: true, include_only_confirmed: true }
		try {
			return await this.request('accounts_pending', data, false)
		} catch {
			return await this.request('accounts_receivable', data, false)
		}
	}

	async accountsReceivableSorted (accounts: string[], count: number = 50): Promise<{ blocks: { [address: string]: { [hash: string]: { amount: string, source: string } } } }> {
		const data = { accounts, count, source: true, include_only_confirmed: true, sorting: true }
		let response
		try {
			response = await this.request('accounts_pending', data, false)
		} catch {
			response = await this.request('accounts_receivable', data, false)
		}
		return response
	}

	async accountsReceivableLimitSorted (accounts: string[], threshold: string, count: number = 50): Promise<{ blocks: { [address: string]: { [hash: string]: { amount: string, source: string } } } }> {
		const data = { accounts, count, threshold, source: true, include_only_confirmed: true, sorting: true }
		let response
		try {
			response = await this.request('accounts_pending', data, false)
		} catch {
			response = await this.request('accounts_receivable', data, false)
		}
		return response
	}

	async delegatorsCount (account: string): Promise<{ count: string }> {
		return await this.request('delegators_count', { account }, false)
	}

	async representativesOnline (): Promise<{ representatives: { [address: string]: { weight: string } } }> {
		return await this.request('representatives_online', { weight: true }, false)
	}

	/**
	 * Reports the number of blocks in the ledger.
	 * @see https://docs.nano.org/commands/rpc-protocol/#block_count
	 */
	async blockCount (): Promise<{
		count: number
		unchecked: number
		cemented: number
	}> {
		return await this.request('block_count', { include_cemented: true }, false)
	}

	/**
	 * Retrieves a JSON representation of the block.
	 * @see https://docs.nano.org/commands/rpc-protocol/#block_info
	 */
	async blockInfo (hash: string): Promise<{
		error?: string
		block_account: string
		amount: string
		balance: string
		height: number
		local_timestamp: string
		successor: string
		confirmed: boolean
		subtype: string
		linked_account: string
		contents: {
			type: string
			account: string
			previous: string
			representative: string
			balance: string
			link: string
			link_as_account: string
			signature: string
			work: string
		}
	}> {
		return await this.request(
			'block_info',
			{ hash, json_block: true, include_linked_account: true },
			false
		)
	}

	/**
	 * Retrieves a JSON representation of blocks.
	 * @see https://docs.nano.org/commands/rpc-protocol/#blocks_info
	 */
	async blocksInfo (hashes: string[]): Promise<{
		blocks_not_found?: string[]
		blocks: {
			[hash: string]: {
				block_account: string
				amount: string
				balance: string
				height: number
				local_timestamp: string
				successor: string
				confirmed: boolean
				subtype: string
				linked_account: string
				receive_hash: string
				contents: {
					type: string
					account: string
					previous: string
					representative: string
					balance: string
					link: string
					link_as_account: string
					signature: string
					work: string
				}
			}
		}
	}> {
		return await this.request(
			'blocks_info',
			{ hashes, receivable: true, source: true, include_not_found: true, json_block: true, receive_hash: true, include_linked_account: true },
			false
		)
	}

	async workGenerate (hash, difficulty, workServer = ''): Promise<{ work: string }> {
		const validateResponse = (res) => {
			if (res.work == null) {
				return {
					err: `Missing field "work".`,
				}
			}
			if (typeof res.work !== 'string') {
				return {
					err: `Invalid type of field "work", expected "string", got "${typeof res.work}".`,
				}
			}
			if (res.work.length !== 16) {
				return {
					err: `Invalid length of field "work", expected 16, got ${res.work.length}.`,
				}
			}
			if (/^[0-9A-F]+$/i.test(res.work) === false) {
				return {
					err: `Invalid contents of field "work", expected hex characters.`,
				}
			}
			return {
				err: null,
			}
		}

		return await this.request('work_generate', { hash, difficulty }, workServer !== '', workServer, validateResponse)
	}
	async process (block, subtype: TxType): Promise<{ hash: string; error?: string }> {
		return await this.request(
			'process',
			{ block: JSON.stringify(block), watch_work: 'false', subtype: TxType[subtype] },
			false
		)
	}
	async accountHistory (account, count = 25, raw = false, offset = 0, reverse = false): Promise<{ history: any }> {
		// use unlimited count if 0
		if (count === 0) {
			return await this.request('account_history', { account, raw, offset, reverse }, false)
		} else {
			return await this.request('account_history', { account, count, raw, offset, reverse }, false)
		}
	}

	/**
	 * Returns info for account.
	 * @param account
	 * @see https://docs.nano.org/commands/rpc-protocol/#account_info
	 */
	async accountInfo (account: string): Promise<any> {
		return await this.request(
			'account_info',
			{ account, receivable: true, representative: true, weight: true },
			false
		)
	}

	async receivable (account, count): Promise<any> {
		return await this.request('receivable', { account, count, source: true, include_only_confirmed: true }, false)
	}
	async receivableLimit (account, count, threshold): Promise<any> {
		return await this.request(
			'receivable',
			{ account, count, threshold, source: true, include_only_confirmed: true },
			false
		)
	}
	async receivableSorted (account, count): Promise<any> {
		return await this.request(
			'receivable',
			{ account, count, source: true, include_only_confirmed: true, sorting: true },
			false
		)
	}
	async receivableLimitSorted (account, count, threshold): Promise<any> {
		return await this.request(
			'receivable',
			{ account, count, threshold, source: true, include_only_confirmed: true, sorting: true },
			false
		)
	}
	async version (): Promise<{
		rpc_version: number
		store_version: number
		protocol_version: number
		node_vendor: string
		network: string
		network_identifier: string
		build_info: string
	}> {
		return await this.request('version', {}, true)
	}
	async confirmationQuorum (): Promise<{
		quorum_delta: string
		online_weight_quorum_percent: number
		online_weight_minimum: string
		online_stake_total: string
		trended_stake_total: string
		peers_stake_total: string
	}> {
		return await this.request('confirmation_quorum', {}, true)
	}
	public deleteCache () {
		localStorage.removeItem(this.storeKey)
	}

	sleep (ms) {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}
}
