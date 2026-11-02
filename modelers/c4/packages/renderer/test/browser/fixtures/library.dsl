workspace "Library" "A city library's lending." {
    model {
        reader = person "Reader" "Borrows books."
        library = softwareSystem "Library" "Lends books to its readers." {
            catalogue = container "Catalogue" "Lists the books." "Kotlin"
            loans = container "Loans" "Keeps track of the loans." "Kotlin"
        }
        reader -> catalogue "Searches for books"
        catalogue -> loans "Checks availability"
    }
    views {
        container library "LibraryContainers" "The library's containers." {
            include *
            properties {
                "c4modeler.element.catalogue" "160,400"
                "c4modeler.element.loans" "520,400"
                "c4modeler.element.reader" "312,0"
            }
        }
    }
}
