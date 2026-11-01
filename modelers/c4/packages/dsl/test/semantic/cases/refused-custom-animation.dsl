workspace {
    model {
        a = element "A"
        b = element "B"
        c = element "C"
        a -> c
    }
    views {
        custom "Custom" {
            include *
            exclude b
            animation {
                a
                b
            }
        }
    }
}
