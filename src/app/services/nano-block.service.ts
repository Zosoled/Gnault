import { Injectable, inject } from '@angular/core'
import {
	ApiService,
	AppSettingsService,
	NotificationsService,
	StateBlock,
	TxType,
	UtilService,
	WalletAccount,
	WorkPoolService
} from 'app/services'
import { Account, Block, Wallet } from 'libnemo'
import { BehaviorSubject } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class NanoBlockService {
	private svcApi = inject(ApiService)
	private svcNotifications = inject(NotificationsService)
	private svcUtil = inject(UtilService)
	private svcWorkPool = inject(WorkPoolService)

	svcAppSettings = inject(AppSettingsService)

	representativeAccounts = [
		'nano_1x7biz69cem95oo7gxkrw6kzhfywq4x5dupw4z1bdzkb74dk9kpxwzjbdhhs', // NanoCrawler
		'nano_1zuksmn4e8tjw1ch8m8fbrwy5459bx8645o9euj699rs13qy6ysjhrewioey', // Nanowallets.guide
		'nano_3chartsi6ja8ay1qq9xg3xegqnbg1qx76nouw6jedyb8wx3r4wu94rxap7hg', // Nano Charts
		'nano_1iuz18n4g4wfp9gf7p1s8qkygxw7wx9qfjq6a9aq68uyrdnningdcjontgar', // NanoTicker / Ricki
		'nano_3msc38fyn67pgio16dj586pdrceahtn75qgnx7fy19wscixrc8dbb3abhbw6', // gr0vity
		'nano_3patrick68y5btibaujyu7zokw7ctu4onikarddphra6qt688xzrszcg4yuo', // Patrick
		'nano_1tk8h3yzkibbsti8upkfa69wqafz6mzfzgu8bu5edaay9k7hidqdunpr4tb6', // rsnano
		'nano_3ekb6tp8ixtkibimyygepgkwckzhds9basxd5zfue4efjnxaan77gsnanick', // Nanick
		'nano_1xckpezrhg56nuokqh6t1stjca67h37jmrp9qnejjkfgimx1msm9ehuaieuq', // Flying Amigos
		'nano_3n7ky76t4g57o9skjawm8pprooz1bminkbeegsyt694xn6d31c6s744fjzzz', // Humble Nano
		'nano_1wenanoqm7xbypou7x3nue1isaeddamjdnc3z99tekjbfezdbq8fmb659o7t', // WeNano
	]

	zeroHash = '0000000000000000000000000000000000000000000000000000000000000000'

	// https://docs.nano.org/releases/network-upgrades/#epoch-blocks
	epochV2SignerAccount = 'nano_3qb6o6i1tkzr6jwr5s7eehfxwg9x6eemitdinbpi7u8bjjwsgqfj4wzser3x'

	newOpenBlock$: BehaviorSubject<boolean | false> = new BehaviorSubject(false)

	get settings () {
		return this.svcAppSettings.settings()
	}

	async generateChange (wallet: Wallet, walletAccount, representativeAccount, ledger = false) {
		const account = Account.load(walletAccount.address)
		const accountInfo = await this.svcApi.accountInfo(account.address)
		if (!accountInfo) throw new Error(`Account must have an open block first`)

		await this.validateAccount(accountInfo, account.publicKey)

		const balance = BigInt(accountInfo.balance)
		const balanceDecimal = balance.toString(10)
		const link = this.zeroHash
		const blockData = {
			type: 'state',
			account: walletAccount.address,
			previous: accountInfo.frontier,
			representative: representativeAccount,
			balance: balanceDecimal,
			link: link,
			signature: null,
			work: null,
		}
		const block = new Block(account, balanceDecimal, accountInfo.frontier)
			.change(representativeAccount)

		if (ledger) {
			const ledgerBlock = {
				previousBlock: accountInfo.frontier,
				representative: representativeAccount,
				balance: balanceDecimal,
			}
			try {
				this.sendLedgerNotification()
				await wallet.sign(walletAccount.index, blockData as unknown as Block, block)
				this.clearLedgerNotification()
			} catch (err) {
				this.clearLedgerNotification()
				this.sendLedgerDeniedNotification()
				return
			}
		} else {
			this.validateAccount(accountInfo, account.publicKey)
			await wallet.sign(walletAccount.index, blockData as unknown as Block)
		}

		if (!this.svcWorkPool.workExists(accountInfo.frontier)) {
			this.svcNotifications.sendInfo(`Generating Proof of Work...`, { identifier: 'pow', length: 0 })
		}

		blockData.work = await this.svcWorkPool.getWork(accountInfo.frontier, 1)
		this.svcNotifications.removeNotification('pow')

		const processResponse = await this.svcApi.process(blockData, TxType.change)
		if (processResponse && processResponse.hash) {
			walletAccount.frontier = processResponse.hash
			this.svcWorkPool.addWorkToCache(processResponse.hash, 1) // Add new hash into the work pool, high PoW threshold for change block
			this.svcWorkPool.removeFromCache(accountInfo.frontier)
			return processResponse.hash
		} else {
			return null
		}
	}

	// This might be used in the future to send state changes on the blocks instead of normal true/false
	// subscribeSend(walletAccount, toAccountID, rawAmount, ledger = false): Observable {
	//   const doSend = async (observable) => {
	//     console.log(`OBS: Promise resolve, running main send logic.`)
	//     const startTime = Date.now()
	//
	//     console.log(`Observable: Creation event run`)
	//     observable.next({ step: 0, startTime: startTime })
	//
	//
	//     const fromAccount = await this.api.accountInfo(walletAccount.address)
	//     if (!fromAccount) throw new Error(`Unable to get account information for ${walletAccount.address}`)
	//
	//     const remaining = new BigNumber(fromAccount.balance).minus(rawAmount)
	//     const remainingDecimal = remaining.toString(10)
	//     let remainingPadded = remaining.toString(16)
	//     while (remainingPadded.length < 32) remainingPadded = '0' + remainingPadded; // Left pad with 0's
	//
	//     let blockData
	//     const representative = fromAccount.representative || (this.settings.settings.defaultRepresentative || this.representativeAccount)
	//
	//     observable.next({ step: 1, startTime: startTime, eventTime: ((Date.now() - startTime) / 1000).toFixed(3) })
	//
	//     let signature = null
	//     if (ledger) {
	//       const ledgerBlock = {
	//         previousBlock: fromAccount.frontier,
	//         representative: representative,
	//         balance: remainingDecimal,
	//         recipient: toAccountID,
	//       }
	//       try {
	//         this.sendLedgerNotification()
	//         await this.ledgerService.updateCache(walletAccount.index, fromAccount.frontier)
	//         const sig = await this.ledgerService.signBlock(walletAccount.index, ledgerBlock)
	//         this.clearLedgerNotification()
	//         signature = sig.signature
	//
	//         observable.next({ step: 2, startTime: startTime, eventTime: ((Date.now() - startTime) / 1000).toFixed(3) })
	//       } catch (err) {
	//         this.clearLedgerNotification()
	//         this.sendLedgerDeniedNotification(err)
	//         return
	//       }
	//     } else {
	//       signature = this.signSendBlock(walletAccount, fromAccount, representative, remainingPadded, toAccountID)
	//       observable.next({ step: 2, startTime: startTime, eventTime: ((Date.now() - startTime) / 1000).toFixed(3) })
	//     }
	//
	//     if (!this.workPool.workExists(fromAccount.frontier)) {
	//       this.notifications.sendInfo(`Generating Proof of Work...`)
	//     }
	//
	//     blockData = {
	//       type: 'state',
	//       account: walletAccount.address,
	//       previous: fromAccount.frontier,
	//       representative: representative,
	//       balance: remainingDecimal,
	//       link: new Account(toAccountID).publicKey,
	//       work: await this.workPool.getWork(fromAccount.frontier),
	//       signature: signature,
	//     }
	//
	//     observable.next({ step: 3, startTime: startTime, eventTime: ((Date.now() - startTime) / 1000).toFixed(3) })
	//
	//     const processResponse = await this.api.process(blockData)
	//     if (!processResponse || !processResponse.hash) throw new Error(processResponse.error || `Node returned an error`)
	//
	//     observable.next({ step: 4, startTime: startTime, eventTime: ((Date.now() - startTime) / 1000).toFixed(3) })
	//
	//     walletAccount.frontier = processResponse.hash
	//     this.workPool.addWorkToCache(processResponse.hash); // Add new hash into the work pool
	//     this.workPool.removeFromCache(fromAccount.frontier)
	//
	//     observable.complete()
	//   }
	//
	//
	//   console.log(`Creating observable... on send...`)
	//   // Create an observable that can be returned instantly.
	//   return new Observable(observable => {
	//
	//     doSend(observable).then(val => console.log(val))
	//   })
	//
	// }

	async generateSend (wallet: Wallet, walletAccount, toAddress: string, rawAmount, ledger = false) {
		const account = Account.load(walletAccount.address)
		const accountInfo = await this.svcApi.accountInfo(account.address)
		if (!accountInfo) {
			throw new Error(`Unable to get account information for ${account.address}`)
		}
		const frontier = await this.svcApi.blockInfo(accountInfo.frontier)
		const recipient = Account.load(toAddress)

		const block = new Block(walletAccount.address, accountInfo.balance, accountInfo.frontier, accountInfo.representative)
			.send(recipient, rawAmount)
		if (ledger) {
			const { contents } = frontier
			const ledgerBlock = new Block(contents.account, contents.balance, contents.previous, contents.representative)
				.send(contents.link, 0)
				.sign(contents.signature)
			try {
				this.sendLedgerNotification()
				await wallet.sign(walletAccount.index, block, ledgerBlock)
			} catch (err) {
				this.sendLedgerDeniedNotification(err)
				return
			} finally {
				this.clearLedgerNotification()
			}
		} else {
			await block.sign(wallet, walletAccount.index)
		}

		try {
			await block.pow()
			const hash = await block.process(this.svcApi.rpc())
			walletAccount.frontier = hash
			this.svcWorkPool.addWorkToCache(hash, 1) // Add new hash into the work pool, high PoW threshold for send block
			this.svcWorkPool.removeFromCache(accountInfo.frontier)
			return hash
		} catch (err) {
			this.svcNotifications.sendError(err?.message ?? err)
		}
	}

	async generateReceive (wallet: Wallet, account: Account, sourceBlock, ledger = false) {
		try {
			await account.refresh(this.svcApi.rpc())
		} catch (err) {
			if (err.message !== 'Account not found') {
				this.svcNotifications.sendError(err?.message ?? err)
			}
		}
		const frontier = account.frontier ? await this.svcApi.blockInfo(account.frontier) : undefined
		const openEquiv = !account?.frontier
		const srcBlockInfo = await this.svcApi.blocksInfo([sourceBlock])
		const srcAmount = BigInt(srcBlockInfo.blocks[sourceBlock].amount)
		const block = new Block(account).receive(sourceBlock, srcAmount)

		// We have everything we need, we need to obtain a signature
		if (ledger) {
			const ledgerBlock = frontier
				? new Block(frontier.contents.account, frontier.contents.balance, frontier.contents.previous, frontier.contents.representative)
					.send(frontier.contents.link, 0)
					.sign(frontier.contents.signature)
				: undefined
			try {
				this.sendLedgerNotification()
				await wallet.sign(account.index, block, ledgerBlock)
			} catch (err) {
				this.sendLedgerDeniedNotification(err)
				return
			} finally {
				this.clearLedgerNotification()
			}
		} else {
			await block.sign(wallet, account.index)
		}

		try {
			await block.pow()
			const hash = await block.process(this.svcApi.rpc())
			account.frontier = hash
			// update the rep view via subscription
			if (openEquiv) {
				this.informNewRep()
			}
			return hash
		} catch (err) {
			this.svcNotifications.sendError(err?.message ?? err)
		}
	}

	// for signing block when offline
	async signOfflineBlock (wallet: Wallet, walletAccount: WalletAccount, block: StateBlock, prevBlock: StateBlock, type: TxType, genWork: boolean, ledger = false) {
		// special treatment if open block
		const openEquiv = type === TxType.open
		console.log('Signing block of subtype: ' + TxType[type])

		if (ledger) {
			let ledgerBlock = null
			if (type === TxType.send) {
				ledgerBlock = {
					previousBlock: block.previous,
					representative: block.representative,
					balance: block.balance,
					recipient: Account.load(block.link).publicKey,
				}
			} else if (type === TxType.receive || type === TxType.open) {
				ledgerBlock = {
					representative: block.representative,
					balance: block.balance,
					sourceBlock: block.link,
				}
				if (!openEquiv) {
					ledgerBlock.previousBlock = block.previous
				}
			} else if (type === TxType.change) {
				ledgerBlock = {
					previousBlock: block.previous,
					representative: block.representative,
					balance: block.balance,
				}
			}
			try {
				const wallet = await Wallet.create('Ledger')
				this.sendLedgerNotification()
				// const sig = await wallet.ledger.sign(walletAccount.index, ledgerBlock)
				await wallet.sign(walletAccount.index, ledgerBlock, prevBlock as unknown as Block)
				this.clearLedgerNotification()
			} catch (err) {
				this.clearLedgerNotification()
				this.sendLedgerDeniedNotification(err)
				return null
			}
		} else {
			await wallet.sign(walletAccount.index, block as unknown as Block)
		}

		if (genWork) {
			// For open blocks which don't have a frontier, use the public key of the account
			const workBlock = openEquiv
				? Account.load(walletAccount.address).publicKey
				: block.previous
			if (!this.svcWorkPool.workExists(workBlock)) {
				this.svcNotifications.sendInfo(`Generating Proof of Work...`, { identifier: 'pow', length: 0 })
			}
			const difficulty = (type === TxType.receive || type === TxType.open)
				? 1 / 64
				: 1
			block.work = await this.svcWorkPool.getWork(workBlock, difficulty)
			this.svcNotifications.removeNotification('pow')
			this.svcWorkPool.removeFromCache(workBlock)
		}
		return block // return signed block (with or without work)
	}

	async validateAccount (accountInfo, accountPublicKey) {
		if (!accountInfo) return

		if (!accountInfo.frontier || accountInfo.frontier === this.zeroHash) {
			if (accountInfo.balance && accountInfo.balance !== '0') {
				throw new Error(`Frontier not set, but existing account balance is nonzero`)
			}

			if (accountInfo.representative) {
				throw new Error(`Frontier not set, but existing account representative is set`)
			}
			return
		}
		const blockResponse = await this.svcApi.blocksInfo([accountInfo.frontier])
		const blockData = blockResponse.blocks[accountInfo.frontier]
		if (!blockData) throw new Error(`Unable to load frontier block data`)
		const { contents, subtype } = blockData
		const { account, balance, previous, representative, type } = contents

		if (accountInfo.balance !== balance || accountInfo.representative !== representative) {
			throw new Error(`Frontier block data doesn't match account info`)
		}

		if (type !== 'state') {
			throw new Error(`Frontier block wasn't a state block, which shouldn't be possible`)
		}
		if (this.svcUtil.hex.fromUint8(this.svcUtil.nano.hashStateBlock(contents)) !== accountInfo.frontier) {
			throw new Error(`Frontier hash didn't match block data`)
		}

		const block = new Block(account, balance, previous, representative)
		if (subtype === 'epoch') {
			const epochV2SignerAccount = Account.load(this.epochV2SignerAccount)
			const isEpochV2BlockSignatureValid = await block.verify(epochV2SignerAccount.publicKey)
			if (isEpochV2BlockSignatureValid !== true) {
				throw new Error(`Node provided an untrusted frontier block that is an unsupported epoch`)
			}
		} else {
			const isFrontierBlockSignatureValid = await block.verify(accountPublicKey)
			if (isFrontierBlockSignatureValid !== true) {
				throw new Error(`Node provided an untrusted frontier block that was signed by someone else`)
			}
		}
	}

	sendLedgerDeniedNotification (err = null) {
		this.svcNotifications.sendWarning(err && err.message || `Transaction denied on Ledger device`)
	}

	sendLedgerNotification () {
		this.svcNotifications.sendInfo(`Waiting for confirmation on Ledger Device...`, { identifier: 'ledger-sign', length: 0 })
	}

	clearLedgerNotification () {
		this.svcNotifications.removeNotification('ledger-sign')
	}

	getRandomRepresentative () {
		return this.representativeAccounts[Math.floor(Math.random() * this.representativeAccounts.length)]
	}

	// Subscribable event when a new open block and we should update the rep info
	informNewRep () {
		this.newOpenBlock$.next(true)
		this.newOpenBlock$.next(false)
	}

}
