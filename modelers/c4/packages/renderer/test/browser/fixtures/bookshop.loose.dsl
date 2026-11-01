# The bookshop, typed by hand
workspace Bookshop {
	model {
		/* the people and the systems they use */
		customer = person Customer "Buys books \
			online."
		bookshop = softwaresystem Bookshop """
			Sells books online,
			day and night.
			"""
		softwaresystem Mail
		customer -> bookshop "Buys books"
	}
	views {
		systemlandscape {
			include *
		}
	}
}
