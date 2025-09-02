import { HttpClient, HttpHeaders } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { Account } from 'libnemo'
import { Observable } from 'rxjs'
import { NotificationService, UtilService } from 'app/services'
import { environment } from 'environments/environment'

@Injectable({ providedIn: 'root' })
export class MusigService {
	private util = inject(UtilService)
	private notificationService = inject(NotificationService)
	private http = inject(HttpClient)

	// The multisig wasm library can be validated by running build-or-validate_musig_wasm.sh
	private wasmURL = environment.desktop
		? '../../../resources/app.asar/dist/assets/lib/musig-nano/musig_nano.wasm.b64'
		: '../../../assets/lib/musig-nano/musig_nano.wasm.b64'

	wasm = null
	wasmErrors = ['No error', 'Internal error', 'Invalid parameter(s)', 'Invalid Participant Input']
	musigStagePtr: number = null
	musigStageNum: number = null
	savedPublicKeys = []

	constructor () {
		// Read the wasm file for multisig
		this.getWASM().subscribe(data => {
			const wasmString = atob(data)
			const wasmBytes = new Uint8Array(wasmString.length)
			for (let i = 0; i < wasmString.length; i++) {
				wasmBytes[i] = wasmString.charCodeAt(i)
			}

			const imports = {
				wasi_snapshot_preview1: {
					fd_write: (fd, iovs, errno, nwritten) => {
						console.error('fd_write called: unimplemented')
						return 0
					},
					proc_exit: () => {
						console.error('proc_exit called: unimplemented')
						return 0
					},
					environ_sizes_get: () => {
						console.error('environ_sizes_get called: unimplemented')
						return 0
					},
					environ_get: () => {
						console.error('environ_get called: unimplemented')
						return 0
					},
					random_get: (ptr, len) => {
						crypto.getRandomValues(new Uint8Array(this.wasm.memory.buffer, ptr, len))
						return 0
					}
				},
				wasi_unstable: {
					random_get: (ptr, len) => {
						crypto.getRandomValues(new Uint8Array(this.wasm.memory.buffer, ptr, len))
						return 0
					}
				},
			}
			WebAssembly.instantiate(wasmBytes, imports).then(w => {
				this.wasm = w.instance.exports
			}).catch(console.error)
		})
	}

	// Load multisig rust library from local file via http
	getWASM (): Observable<any> {
		return this.http.get(this.wasmURL, {
			headers: new HttpHeaders({
				'Accept': 'text/html, application/xhtml+xml, */*',
				'Content-Type': 'application/x-www-form-urlencoded'
			}),
			responseType: 'text'
		})
	}

	resetMusig () {
		this.musigStagePtr = null
		this.musigStageNum = null
		this.savedPublicKeys = []
	}

	copyToWasm (bytes, ptr = null) {
		if (!ptr) {
			ptr = this.wasm.musig_malloc(bytes.length)
		}
		const buf = new Uint8Array(this.wasm.memory.buffer, ptr, bytes.length)
		for (let i = 0; i < bytes.length; i++) {
			buf[i] = bytes[i]
		}
		return ptr
	}
	copyFromWasm (ptr, length) {
		const out = new Uint8Array(length)
		for (let i = 0; i < length; i++) {
			out[i] = this.wasm.memory.buffer[ptr + i]
		}
		return out
	}

	wasmError (errCode) {
		throw new Error('Multisig error ' + errCode + ': ' + this.wasmErrors[errCode])
	}

	runAggregate (storedAccounts, runWithPubkeys = null) {
		try {
			return this.aggregate(storedAccounts, runWithPubkeys)
		} catch (err) {
			this.notificationService.sendError(err.toString(), { length: 0 })
			return null
		}
	}

	runMultiSign (privateKey, blockHash, inputMultisigData) {
		try {
			return this.multiSign(privateKey, blockHash, inputMultisigData)
		} catch (err) {
			this.notificationService.sendError(err.toString(), { length: 0 })
			return null
		}
	}

	async aggregate (storedAccounts, runWithPubkeys = null) {
		let addresses = []
		if (runWithPubkeys && this.savedPublicKeys?.length > 1) {
			for (const pubKey of this.savedPublicKeys) {
				const account = Account.load(pubKey)
				addresses.push(account.address)
			}
		} else {
			addresses = storedAccounts
			if (addresses.length < 2) {
				throw new Error('Must have at least 2 participating addresses!')
			}
		}
		const pubkeys = []
		for (let address of addresses) {
			address = address.trim()
			if (!address.startsWith('xrb_') && !address.startsWith('nano_')) {
				throw new Error('Nano addresses must start with xrb_ or nano_')
			}
			try {
				const { publicKey } = Account.load(address)
				pubkeys.push(publicKey)
			} catch (err_) {
				console.error(err_.toString())
				throw new Error('Invalid nano address (bad character?)')
			}
		}
		const pubkeyPtrs = this.wasm.musig_malloc(pubkeys.length * 4)
		const pubkeyPtrsBuf = new Uint32Array(this.wasm.memory.buffer, pubkeyPtrs, pubkeys.length)
		for (let i = 0; i < pubkeys.length; i++) {
			pubkeyPtrsBuf[i] = this.copyToWasm(pubkeys[i])
		}
		const outPtr = this.wasm.musig_malloc(33)
		const outBuf = new Uint8Array(this.wasm.memory.buffer, outPtr, 33)
		outBuf[0] = 0
		this.wasm.musig_aggregate_public_keys(pubkeyPtrs, pubkeys.length, outPtr, outPtr + 1)
		if (runWithPubkeys) runWithPubkeys(pubkeyPtrs, pubkeys.length)
		for (let i = 0; i < pubkeyPtrsBuf.length; i++) {
			this.wasm.musig_free(pubkeyPtrsBuf[i])
		}
		this.wasm.musig_free(pubkeyPtrs)
		const err = outBuf[0]
		if (err !== 0) {
			this.wasm.musig_free(outPtr)
			throw this.wasmError(err)
		}
		const aggPubkey = outBuf.subarray(1).slice()
		const { address } = Account.load(aggPubkey)
		console.log('Multisig Account: ' + address)
		this.wasm.musig_free(outPtr)
		return { 'multisig': address, 'pubkey': aggPubkey }
	}

	async multiSign (privateKey, blockHash, inputMultisigData) {
		let multisigAccount = ''
		// Stage 0 (init)
		if (!this.musigStagePtr) {
			if (!this.util.nano.isValidHash(privateKey)) {
				throw new Error('Invalid private key')
			}
			if (!this.util.nano.isValidHash(blockHash)) {
				throw new Error('Invalid block hash')
			}
			const outPtr = this.wasm.musig_malloc(65)
			const outBuf = new Uint8Array(this.wasm.memory.buffer, outPtr, 65)
			outBuf[0] = 0
			try {
				this.musigStagePtr = this.wasm.musig_stage0(outPtr, outPtr + 33)
				this.musigStageNum = 0
			} catch (err_) {
				if (this.musigStagePtr) {
					this.wasm.musig_free_stage0(this.musigStagePtr)
				}
				this.musigStagePtr = undefined
				this.musigStageNum = undefined
				throw err_
			}
			const err = outBuf[0]
			if (err !== 0) {
				this.musigStagePtr = undefined
				this.musigStageNum = undefined
				this.wasm.musig_free(outPtr)
				throw this.wasmError(err)
			}

			const finalBuf = outBuf
			this.wasm.musig_free(outPtr)
			return { 'outbuf': finalBuf, 'stage': this.musigStageNum, 'multisig': multisigAccount }

			// Further steps
		} else {
			const protocolInputs = []
			// only use the first part of the data
			for (const input of inputMultisigData) {
				protocolInputs.push(input.substring(2, 66).toLowerCase())
			}
			const protocolInputPtrs = this.wasm.musig_malloc(protocolInputs.length * 4)
			const protocolInputPtrsBuf = new Uint32Array(this.wasm.memory.buffer, protocolInputPtrs, protocolInputs.length)
			for (let i = 0; i < protocolInputs.length; i++) {
				protocolInputPtrsBuf[i] = this.copyToWasm(this.util.hex.toUint8(protocolInputs[i]))
			}

			let privateKeyPtr
			if (this.musigStageNum === 0) {
				privateKeyPtr = this.copyToWasm(this.util.hex.toUint8(privateKey))
			}

			const outLen = this.musigStageNum === 2
				? 65
				: 33
			const outPtr = this.wasm.musig_malloc(outLen)
			const outBuf = new Uint8Array(this.wasm.memory.buffer, outPtr, outLen)
			outBuf[0] = 0
			let newStagePtr

			if (this.musigStageNum === 0) {
				// Extract public keys from the participants
				this.savedPublicKeys = []
				// only use the second part of the data
				for (const input of inputMultisigData) {
					this.savedPublicKeys.push(input.substring(66, 130).toLowerCase())
				}
				// Add the public key from self
				const account = await Account.load(privateKey, 'private')
				const pub = account.publicKey
				if (this.savedPublicKeys.includes(pub.toLowerCase())) {
					throw new Error('You must use different private keys for each participant!')
				}
				this.savedPublicKeys.push(pub)

				const blockhash = this.util.hex.toUint8(blockHash)
				const blockhashPtr = this.copyToWasm(blockhash)
				const result = await this.aggregate('', (pubkeys, pubkeysLen) => {
					const flags = 0 // Set to 1 if private key is a raw/expanded scalar (unusual)
					newStagePtr = this.wasm.musig_stage1(this.musigStagePtr, privateKeyPtr, pubkeys, pubkeysLen, flags,
						blockhashPtr, blockhash.length, protocolInputPtrs, protocolInputs.length, outPtr, null, outPtr + 1)
				})
				multisigAccount = result?.multisig
				this.musigStageNum = 0
				this.wasm.musig_free(privateKeyPtr)
				this.wasm.musig_free(blockhashPtr)

			} else if (this.musigStageNum === 1) {
				newStagePtr = this.wasm.musig_stage2(this.musigStagePtr, protocolInputPtrs, protocolInputs.length, outPtr, outPtr + 1)
			} else if (this.musigStageNum === 2) {
				newStagePtr = this.wasm.musig_stage3(this.musigStagePtr, protocolInputPtrs, protocolInputs.length, outPtr, outPtr + 1)
			} else {
				this.wasm.musig_free(outPtr)
				throw new Error('Unexpected musigStageNum ' + this.musigStageNum)
			}
			const err = outBuf[0]
			if (err !== 0) {
				this.wasm.musig_free(outPtr)
				throw this.wasmError(err)
			}
			this.musigStagePtr = newStagePtr
			this.musigStageNum++

			const finalBuf = new Uint8Array(outBuf) // make a copy to avoid pointer being reset by musig_free
			this.wasm.musig_free(outPtr)
			return { 'outbuf': finalBuf, 'stage': this.musigStageNum, 'multisig': multisigAccount }
		}
	}
}
