/*
	Alexander Shiryaev, 2021.05, 2022.02, 2022.06

	IMPLEMENTATION NOTES:
		write non-blocking
		read polling (GLib)
		auto re-open on timer (GLib)
*/

uses GLib

uses COMPorts0

namespace COMPorts

	const private TRACE: bool = false

	enum private State
		INIT
		OPEN
		CLOSED

	const private TIMER_INTERVAL_MS: int = 50

	const private IN_BUF_LEN: int = 1024

	struct OpenPar
		dev: string
		baud: COMPorts0.Baud
		parity: COMPorts0.Parity

	delegate Receive (a: array of uchar)

	delegate OnOpen (p: Port)
	delegate OnClose (p: Port)

	struct Notifiers
		onOpen: unowned OnOpen
		onClose: unowned OnClose

	struct private Out
		a: array of char
		w: int
		len: int

	def bufRepr (a: array of uchar): string
		s: string
		if a.length > 0
			s = (a[0]).to_string("$%02X")
			i: int = 1
			while i < a.length
				s = s + " " + (a[i]).to_string("$%02X")
				i++
		else
			s = ""
		return s

	def private close1 (channel: GLib.IOChannel, fd: COMPorts0.FD)
		try
			channel.shutdown(false)
		except
			pass
		COMPorts0.close(fd)

	class Port
		state: private State

		fd: private FD

		channel: private GLib.IOChannel
		evIn: private uint
		evOut: private uint
		outBusy: private bool
		evPri: private uint
		evHup: private uint
		evErr: private uint
		evNVal: private uint

		timerStarted: private bool
		eventSourceIdTimer: private uint

		openPar: private OpenPar
		notifiers: private Notifiers
		receive: private unowned Receive
		out: private Out

		construct (openPar: OpenPar, receive: Receive, notifiers: Notifiers, outBufLen: int)
			self.openPar = openPar
			self.notifiers = notifiers

			self.out = Out(){
				a = new array of char[outBufLen],
				len = outBufLen,
				w = 0
			}

			self.receive = receive

			self.state = State.INIT

			self.timerStarted = false

		def setOpenPar (openPar: OpenPar): bool
			res:bool = false
			case self.state
				when State.INIT,State.CLOSED
					self.openPar = openPar
					res = true
				when State.OPEN
					res = false
				default
					assert false
			return res

		def setReceive (receive: Receive)
			self.receive = receive

		def setNotifiers (notifiers: Notifiers)
			self.notifiers = notifiers

		def setOutBufLen (outBufLen: int)
			assert outBufLen >= 0
			if self.out.len != outBufLen
				self.out = Out(){
					a = new array of char[outBufLen],
					len = outBufLen,
					w = 0
				}

		def isOutBufEmpty (): bool
			res:bool = false
			case self.state
				when State.INIT,State.CLOSED
					res = true
				when State.OPEN
					res = self.out.w == 0
				default
					assert false
			return res

		def private removeEventSources0 ()
			GLib.Source.remove(self.evPri)
			GLib.Source.remove(self.evHup)
			GLib.Source.remove(self.evErr)
			GLib.Source.remove(self.evNVal)

			GLib.Source.remove(self.evIn)

			if self.outBusy
				self.outBusy = false
				GLib.Source.remove(self.evOut)
				if TRACE
					print("COMTPorts: out event source removed")

		def private close0 ()
			assert self.state == State.OPEN
			if self.notifiers.onClose != null
				self.notifiers.onClose(self)
			self.state = State.CLOSED
			removeEventSources0()
			close1(self.channel, self.fd)

		def private read0 (a: array of char, out rd: int, out res: int)
			rd = 0
			try
				rd0: size_t
				var status = self.channel.read_chars(a, out rd0)
				case status
					when GLib.IOStatus.NORMAL
						rd = (int)rd0
						res = 0
					when GLib.IOStatus.AGAIN
						rd = 0
						res = 0
					when GLib.IOStatus.ERROR
						res = 1
					default
						res = 2
						print("status: %s", status.to_string())
						assert false
			except
				res = 3
				print("exception on read")
				assert false

		def private processIn ()
			a: char[IN_BUF_LEN]
			res1: int
			res: int
			rd: int

			if self.state == State.CLOSED
				open(out res1)
			if self.state == State.OPEN
				read0(a, out rd, out res)
				if res == 0
					assert rd >= 0
					if rd > 0
						assert rd <= IN_BUF_LEN
						if self.receive != null
							self.receive((array of uchar)a[0:rd])
				else
					close0()
					/* open(out res1) */

		def private write0 (out wr: int, out res: int)
			wr = 0
			try
				wr0: size_t
				var status = self.channel.write_chars(self.out.a[0:self.out.w], out wr0)
				case status
					when GLib.IOStatus.NORMAL
						wr = (int)wr0
						res = 0
						if TRACE
							print("COMTPorts: written: %s", bufRepr((array of uchar)self.out.a[0:self.out.w]))
					when GLib.IOStatus.AGAIN
						wr = 0
						res = 0
					default
						res = 1
			except
				res = 2
				assert false

		def private processOut ()
			res1: int
			res: int
			wr: int

			if self.state == State.CLOSED
				open(out res1)

			if self.state == State.OPEN
				if self.out.w > 0
					write0(out wr, out res)
					if res == 0
						assert wr >= 0
						if wr > 0
							assert wr <= self.out.w
							self.out.w -= wr
							i: int = 0
							while i < self.out.w
								self.out.a[i] = self.out.a[i + wr]
								i++
					else
						close0()
						// open(out res1)

		def private gio (channel: GLib.IOChannel, condition: GLib.IOCondition): bool
			res:bool = false
			case condition
				when GLib.IOCondition.PRI
					print("COMTPorts.IOPri")
					if self.state == State.OPEN
						close0()
					res = false
				when GLib.IOCondition.HUP
					print("COMTPorts.IOHup")
					if self.state == State.OPEN
						close0()
					res = false
				when GLib.IOCondition.ERR
					print("COMTPorts.IOErr")
					if self.state == State.OPEN
						close0()
					res = false
				when GLib.IOCondition.NVAL
					print("COMTPorts.IONVal")
					if self.state == State.OPEN
						close0()
					res = false
				when GLib.IOCondition.IN
					processIn()
					case self.state
						when State.INIT,State.CLOSED
							res = false
						when State.OPEN
							res = true
						default
							assert false
				when GLib.IOCondition.OUT
					assert self.outBusy
					processOut()
					case self.state
						when State.INIT,State.CLOSED
							res = false
						when State.OPEN
							if self.out.w > 0
								res = true
							else
								res = false
						default
							assert false
					if not res
						self.outBusy = false
						if TRACE
							print("COMTPorts.gio: out event source stopped")
				default
					assert false
			return res

		def private onTimer (): bool
			res: bool
			res1: int

			if self.state == State.CLOSED
				open(out res1)

			if self.timerStarted
				res = true
			else
				print("XXX: COMTPorts.OnTimer: timer not started")
				res = false

			return res

		def private startTimer ()
			if not self.timerStarted
				self.timerStarted = true
				self.eventSourceIdTimer = GLib.Timeout.add(TIMER_INTERVAL_MS, onTimer)

		def private stopTimer ()
			if self.timerStarted
				self.timerStarted = false
				GLib.Source.remove(self.eventSourceIdTimer)

		def open (out res: int)
			case self.state
				when State.INIT,State.CLOSED
					COMPorts0.open(self.openPar.dev, self.openPar.baud, self.openPar.parity, out self.fd, out res)
					if res == 0
						self.channel = new GLib.IOChannel.unix_new((int)self.fd)
						try
							if self.channel.set_flags(GLib.IOFlags.NONBLOCK) == GLib.IOStatus.NORMAL
								if self.channel.set_encoding(null) == GLib.IOStatus.NORMAL
									self.channel.set_buffered(false)
									self.out.w = 0
									self.state = State.OPEN
									self.outBusy = false
									if self.notifiers.onOpen != null
										self.notifiers.onOpen(self)

									self.evPri = self.channel.add_watch(GLib.IOCondition.PRI, gio)
									self.evHup = self.channel.add_watch(GLib.IOCondition.HUP, gio)
									self.evErr = self.channel.add_watch(GLib.IOCondition.ERR, gio)
									self.evNVal = self.channel.add_watch(GLib.IOCondition.NVAL, gio)

									self.evIn = self.channel.add_watch(GLib.IOCondition.IN, gio)

									startTimer()

								else
									close1(self.channel, self.fd)
									self.channel = null
									res = 3
							else
								close1(self.channel, self.fd)
								self.channel = null
								res = 2
						except
							close1(self.channel, self.fd)
							self.channel = null
							res = 1
					else
						res = res + 100
				when State.OPEN
					res = 0 /* already open */
				default
					res = -1
					assert false

		def private send0 (a: array of uchar, partial: bool): int
			var len = a.length
			var available = self.out.len - self.out.w
			assert len >= 0
			assert available >= 0
			if (len > available) and partial
				len = available

			if available >= len
				if len > 0
					GLib.Memory.copy(&self.out.a[self.out.w], a, len)
					self.out.w += len
			else
				len = 0

			processOut()

			if self.state == State.OPEN
				if self.out.w > 0
					if not self.outBusy
						self.outBusy = true
						self.evOut = self.channel.add_watch(GLib.IOCondition.OUT, gio)
						if TRACE
							print("COMTPorts: out event source added")

			return len

		def send (a: array of uchar): bool
			return send0(a, false) == a.length

		def sendPartial (a: array of uchar): int
			return send0(a, true)

		def close ()
			case self.state
				when State.INIT
					/* never opened */
					pass
				when State.OPEN
					stopTimer()
					if self.notifiers.onClose != null
						self.notifiers.onClose(self)
					self.state = State.INIT
					removeEventSources0()
					close1(self.channel, self.fd)
				when State.CLOSED
					stopTimer()
					self.state = State.INIT
				default
					assert false

		final
			close()
